"""Issue19: independent CLEAR reference; historical speed-6 imports stay frozen.
Production implements the chosen two-candidate/MAX policy, never this CLEAR loop.
"""
import argparse
import json
import math
from functools import lru_cache
from pathlib import Path
import simulate as old

CHECKPOINTS = (0,1,2,10,15,16,17,20,25,30,40,50)
VARIANTS = ('speed-6', 'cap8', 'regular12', 'deep12', 'D')
POLICIES = ('atk-first', 'route-first', 'atk50', 'efficiency')

# All five candidates share frozen speed-6 HP/effect coefficients. Cache only
# repeated reference arithmetic, not purchases, CLEARs, or strategy decisions.
@lru_cache(maxsize=8192)
def stage_hp(stage):
    return old.hp(stage)

@lru_cache(maxsize=32768)
def ability(atk,speed,crit,overkill,route,power,tempo,p,deep):
    damage=old.CONFIG['damage_base']*1.16**atk*(1+.70*power)
    dps=damage*1.25**speed*(1+.2*crit)
    delay=old.CONFIG['delay_base']/(.60**(-route)+old.CONFIG['atk_delay']**(-atk)-1)*.85**tempo
    meta=old.Meta(prestige_count=p,deep_mastery=deep)
    return dps*(1+.15*overkill),delay,old.mastery(meta)

def clear_time(stage,levels,meta):
    divisor,delay,mastery=ability(levels['atk'],levels['speed'],levels['crit'],levels['overkill'],levels['delay'],meta.power,meta.tempo,meta.prestige_count,meta.deep_mastery)
    return mastery*(stage_hp(stage)/divisor+delay)


def passive(p, d, clears, variant='D'):
    if p == 0:
        return dict(speed=int(clears >= 6), crit=int(clears >= 20), overkill=int(clears >= 40))
    maximum = 12 if variant == 'regular12' else 10 if variant == 'D' else 8
    deep = min(12, 8+d) if p >= 16 and variant in ('deep12','D') else 0
    return dict(speed=min(8,1+(p+1)//2), crit=max(min(maximum,1+p//2),deep),
                overkill=max(min(maximum,1+max(0,p-1)//2),deep))

def order(levels, gold, meta, stage, keys, policy, reserve):
    keys=list(keys)
    if len(keys)!=2: return keys
    if policy=='route-first' or (policy=='atk50' and levels['atk']>=50): keys.reverse()
    if policy=='efficiency':
        current=clear_time(stage,levels,meta)
        def score(key):
            after=dict(levels);after[key]+=1
            cost=old.CONFIG['base'][key]*old.CONFIG['growth'][key]**levels[key]
            return max(0,current-clear_time(stage,after,meta))/cost
        if score('delay') > score('atk'): keys.reverse()
        needed=old.CONFIG['base'][keys[0]]*old.CONFIG['growth'][keys[0]]**levels[keys[0]]
        if gold-reserve+1e-9 < needed: return []
    return keys


def cycle(meta, highest, variant, policy='route-first', farm=False, auto=False,
          reserve=0, atk_on=True, route_on=True, horizon=100000, manual_route_interval=1):
    t = gold = phase = 0.0
    clears = 0
    levels = dict.fromkeys(old.CONFIG['base'],0)
    caps = dict(atk=1000000, **old.caps(meta.prestige_count))
    spent = dict.fromkeys(levels,0.0)
    buys = dict.fromkeys(levels,0)
    last_buy = dict.fromkeys(levels,0.0)
    max_gap = dict.fromkeys(levels,0.0)
    next_decision = 1
    burst = reach800 = route_unlock = None
    thresholds = {}
    required = old.boundary(highest)+1
    lifetime900 = getattr(meta,'highest',0) >= 900
    start = clear_time(1, {**levels, **(passive(meta.prestige_count,meta.deep_mastery,0,variant) if variant!='speed-6' else {})},meta)
    def buy(key,budget):
        nonlocal gold
        n=0
        # Reference-only enumeration; game uses maxBuy / geometric bulkPrice.
        while levels[key] < caps[key]:
            cost=old.CONFIG['base'][key]*old.CONFIG['growth'][key]**levels[key]
            if cost > budget+1e-9: break
            gold-=cost;budget-=cost;spent[key]+=cost;levels[key]+=1;n+=1
        if n:
            buys[key]+=1
            max_gap[key]=max(max_gap[key],t-last_buy[key]);last_buy[key]=t
        return n
    while clears < required or (farm and burst is None):
        if variant!='speed-6': levels.update(passive(meta.prestige_count,meta.deep_mastery,clears,variant))
        stage=min(highest,1+clears//5)
        ct=clear_time(stage,levels,meta)
        for threshold in (1,.1,.01,.001):
            if ct < threshold and threshold not in thresholds: thresholds[threshold]=t
        if ct < .001 and burst is None: burst=t
        if clears >= required and (not farm or burst is not None): break
        clear_at=t+(1-phase)*ct
        event=min(clear_at,next_decision)
        if event > horizon:
            return dict(seconds=horizon,censored=True,atk=levels['atk'],route=levels['delay'])
        phase+=(event-t)/ct;t=event
        if clear_at <= t+1e-9:
            phase=0.;clears+=1;gold+=10*(1+.55*meta.wealth)*old.stage_gold(stage)
            if stage==800 and reach800 is None: reach800=t
            if stage>=900 and not lifetime900:
                lifetime900=True;route_unlock=t
                if auto: last_buy["delay"]=t
            if clears==required and not farm: break
        if next_decision <= t+1e-9:
            if variant!='speed-6': levels.update(passive(meta.prestige_count,meta.deep_mastery,clears,variant))
            if variant=='speed-6':
                for key in ('speed','crit','overkill'):
                    if meta.prestige_count>0 or clears>=old.CONFIG['unlock'][key]: buy(key,gold)
            route_allowed=(meta.prestige_count>0 or clears>=70) and levels['delay']<caps['delay']
            keys=[]
            if not auto or atk_on: keys.append('atk')
            if route_allowed and ((not auto and math.isclose(t % manual_route_interval,0,abs_tol=1e-8)) or (auto and route_on and lifetime900)): keys.append('delay')
            chosen_policy=policy if not auto or lifetime900 else 'atk-first'
            keys=order(levels,gold,meta,min(highest,1+clears//5),keys,chosen_policy,reserve)
            for key in keys: buy(key,max(0,gold-reserve))
            next_decision+=1
            # Empty decisions have no effect. Stop skipping at P0 passive CLEARs.
            current=clear_time(min(highest,1+clears//5),levels,meta)
            next_decision=max(next_decision,math.ceil(t+(1-phase)*current-1e-10))
            if manual_route_interval>1:
                next_decision=min(next_decision,(math.floor(t/manual_route_interval)+1)*manual_route_interval)
    return dict(seconds=t,censored=False,reach800=reach800,start=start,end=clear_time(highest,levels,meta),
                passives={k:levels[k] for k in ('speed','crit','overkill')},atk=levels['atk'],route=levels['delay'],
                spent=spent,buys=buys,max_gap=max_gap,soul=old.soul_reward(highest,meta.prestige_count),
                soul_min=old.soul_reward(highest,meta.prestige_count)*60/t,burst=burst,
                thresholds=thresholds,route_unlock=route_unlock,gold=gold)

def series(variant='D',strategy='escape',policy='route-first',cycles=51,auto=False,reserve=0):
    meta=old.Meta();meta.highest=0
    rows=[];total=0
    for p in range(cycles):
        target=old.target_stage(p)
        if p>=16 and strategy!='escape': target=max(target,800+50*(meta.deep_mastery+(1 if strategy=='+1' else 3)))
        r=cycle(meta,target,variant,policy,auto=auto,reserve=reserve)
        if r['censored']: raise RuntimeError((variant,strategy,policy,p,r))
        before=meta.deep_mastery
        meta.deep_mastery=max(before,max(0,(target-800)//50))
        total+=r['seconds'];r.update(p=p,required=old.target_stage(p),highest=target,total=total,deep_before=before,deep_after=meta.deep_mastery,permanent=[meta.power,meta.wealth,meta.tempo])
        rows.append(r)
        meta.soul+=r['soul'];meta.prestige_count+=1;meta.highest=max(meta.highest,target);old.spend_soul(meta)
    return rows

def early(variant='D',policy='route-first',model='active'):
    meta=old.Meta();rows=[];total=0
    for p in range(3):
        r=cycle(meta,100,variant,policy,farm=p==2,auto=model=='auto',route_on=False,manual_route_interval=60 if model=='casual' else 1)
        r['total']=total+r['seconds'];rows.append(r)
        total+=r['seconds'];meta.soul+=r['soul'];meta.prestige_count+=1;old.spend_soul(meta)
    return rows

def vectors():
    result=[]
    cases=[(0,0,1,1000,0,True,True),(41,3,1,12663,1000,True,True),
           (41,3,1,12664,1000,True,True),(55,6,800,1e7,1000,True,True),
           (50,10,1000,1e9,0,True,True),(70,30,800,1e6,0,True,True),
           (30,0,1,50,1000,True,True),(0,0,1,1e7,1000,True,False),
           (0,0,1,1e7,1000,False,True),(50,8,1,1e6,1000,False,False)]
    for atk,route,stage,gold,reserve,atk_on,route_on in cases:
        meta=old.Meta(prestige_count=17,deep_mastery=3)
        levels=dict(passive(17,3,0),atk=atk,delay=route)
        keys=(['atk'] if atk_on else [])+(['delay'] if route_on and route<30 else [])
        chosen=order(levels,gold,meta,stage,keys,'efficiency',reserve)
        remain=gold
        for key in chosen:
            upper=1000000 if key=='atk' else 30
            while levels[key]<upper:
                cost=old.CONFIG['base'][key]*old.CONFIG['growth'][key]**levels[key]
                if cost>remain-reserve+1e-9: break
                remain-=cost;levels[key]+=1
        result.append(dict(atk=atk,route=route,stage=stage,gold=gold,reserve=reserve,atk_on=atk_on,route_on=route_on,
                           order=chosen,expected_atk=levels['atk'],expected_route=levels['delay'],expected_gold=remain))
    return result

def write_csv(data,path):
    import csv
    fields=['model','p','required','highest','seconds','total','reach800','speed','crit','overkill','atk','route',
            'gold_atk','gold_route','gold_passives','buy_atk','buy_route','buy_passives','soul','soul_min','deep_before','deep_after','burst','start','end','power','wealth','tempo','route_unlock','max_atk_gap','max_route_gap']
    with open(path,'w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");writer.writeheader()
        for name,rows in data.items():
            if name=='probes' or name.endswith('/early'): continue
            for row in rows:
                if row['p'] not in CHECKPOINTS: continue
                r={k:row.get(k) for k in fields if k not in ('model',)}
                r.update(model=name,**row['passives'],gold_atk=row['spent']['atk'],gold_route=row['spent']['delay'],
                         gold_passives=sum(row['spent'][k] for k in ('speed','crit','overkill')),
                         buy_atk=row['buys']['atk'],buy_route=row['buys']['delay'],buy_passives=sum(row['buys'][k] for k in ('speed','crit','overkill')),
                         power=row['permanent'][0],wealth=row['permanent'][1],tempo=row['permanent'][2],
                         max_atk_gap=row['max_gap']['atk'],max_route_gap=row['max_gap']['delay'])
                writer.writerow(r)


def report(check=False):
    results={}
    for variant in VARIANTS:
        for strategy in ('escape','+1','deep-run'):
            rows=series(variant,strategy)
            results[f'{variant}/{strategy}/manual-route-first']=rows
            print(variant,strategy,'P20/30/50',*[round(rows[p]['seconds'],2) for p in (20,30,50)])
    for policy in POLICIES:
        for strategy in ('escape','+1','deep-run'):
            rows=series('D',strategy,policy,auto=True)
            results[f'D/{strategy}/auto-{policy}']=rows
            print('AUTO',policy,strategy,'P20/30/50',*[round(rows[p]['seconds'],2) for p in (20,30,50)])
    for variant in VARIANTS:
        rows=early(variant)
        results[f'{variant}/early']=rows
        print('EARLY',variant,'prestige',round(rows[0]['seconds'],3),'burst',round(rows[-1]['total'],3))
    for model in ('casual','auto'):
        rows=early(model=model);results[f'D/{model}/early']=rows
        print('EARLY',model,'prestige',round(rows[0]['seconds'],3),'burst',round(rows[-1]['total'],3))
    probes=[]
    for policy in POLICIES:
        for reserve in (0,1000):
            for atk,route in ((True,False),(False,True),(True,True)):
                meta=old.Meta(prestige_count=17,power=9,wealth=9,tempo=8,deep_mastery=1)
                meta.highest=900
                r=cycle(meta,800,'D',policy,auto=True,reserve=reserve,atk_on=atk,route_on=route,horizon=7200)
                probes.append(dict(policy=policy,reserve=reserve,atk_on=atk,route_on=route,**r))
                print('PROBE',policy,reserve,atk,route,round(r['seconds'],2),r['atk'],r['route'],r['censored'])
    results['probes']=probes
    if check:
        assert passive(17,3,0)==dict(speed=8,crit=11,overkill=11)
        assert passive(17,4,0)==dict(speed=8,crit=12,overkill=12)
        assert passive(15,4,0)==dict(speed=8,crit=8,overkill=8)
        baseline=old.simulate(17,normal_policy='immediate')
        assert all(abs(a.seconds-b['seconds'])<1e-5 for a,b in zip(baseline,results['speed-6/escape/manual-route-first']))
        assert abs(results['speed-6/early'][-1]['total']-933.056045)<1e-4
        golden=Path(__file__).resolve().parents[2]/'tests/data/speed7-reference.json'
        if golden.exists():
            expected=json.loads(golden.read_text(encoding='utf-8'))
            assert all(abs(a-b['seconds'])<1e-5 for a,b in zip(expected['immediate'],results['D/escape/manual-route-first']))
        assert all(x['spent'][k]==0 for x in results['D/escape/manual-route-first'] for k in ('speed','crit','overkill'))
        for name in ('+1','deep-run'):
            rows=results[f'D/{name}/auto-efficiency']
            assert all(not r['censored'] for r in rows)
            assert all(r['atk']>0 and r['route']>0 for r in rows[18:])
        for r in probes:
            if r['atk_on'] and r['route_on']:
                assert not r['censored'] and r['gold']>=r['reserve']-1e-6
        vector_path=Path(__file__).resolve().parents[2]/'tests/data/auto-route-reference.json'
        if vector_path.exists(): assert json.loads(vector_path.read_text(encoding='utf-8'))==vectors()
        print('PASS: historical baseline, passive boundaries, paid SOUL, 5 variants / 3 strategies / 4 AUTO policies')
    return results

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--output');parser.add_argument('--csv')
    args=parser.parse_args();data=report(args.check)
    if args.csv: write_csv(data,args.csv)
    if args.output: Path(args.output).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
