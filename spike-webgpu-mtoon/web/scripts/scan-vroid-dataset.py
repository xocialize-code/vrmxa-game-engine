# Scans the local VRoid Hub crawl (/Volumes/DEV_ARCHIVE/vroid-vrm-dataset/vroid) and picks the AB-T-0553 test sample.
# Licence filter (conservative, since Xocialize is a company): the model allows corporate commercial use and use by
# others, and is not age-limited (R15, R18, adult). It reads only each GLB's JSON chunk and summarises MToon inputs.
# Models and pictures are never committed; results/vroid-sample.json keeps ids, features and the credit line.
#   python3 -I scripts/scan-vroid-dataset.py <dataset>/vroid > ../results/vroid-sample.json
import json, os, struct, sys, random
root = sys.argv[1]; limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10**9; random.seed(553)
dirs = []
for b in sorted(os.listdir(root)):
    p = os.path.join(root, b)
    if os.path.isdir(p): dirs += [os.path.join(p, d) for d in os.listdir(p)]
random.shuffle(dirs)
out = []; seen = 0; ages = {}
for d in dirs:
    mid = os.path.basename(d)
    jf, vf = os.path.join(d, mid + '.json'), os.path.join(d, mid + '.vrm')
    if not (os.path.exists(jf) and os.path.exists(vf)): continue
    seen += 1
    m = json.load(open(jf)); lic = m.get('license') or {}
    ages[str(m.get('age_limit'))] = ages.get(str(m.get('age_limit')), 0) + 1
    if lic.get('corporate_commercial_use') != 'allow' or not m.get('is_other_users_available'): continue
    age = m.get('age_limit') or {}
    if isinstance(age, dict) and (age.get('is_r18') or age.get('is_r15') or age.get('is_adult')): continue
    with open(vf, 'rb') as f:
        magic, ver, length = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF': continue
        clen, ctype = struct.unpack('<I4s', f.read(8)); g = json.loads(f.read(clen))
    ext = g.get('extensions', {}); feats = set(); nmat = 0
    if 'VRMC_vrm' in ext:
        spec = '1.0'
        for mat in g.get('materials', []):
            mt = mat.get('extensions', {}).get('VRMC_materials_mtoon')
            if not mt: continue
            nmat += 1
            if mt.get('matcapTexture') and any(mt.get('matcapFactor', [1,1,1])[:3]): feats.add('matcap')
            if any(mt.get('parametricRimColorFactor', [0,0,0])): feats.add('rim')
            if mt.get('rimMultiplyTexture'): feats.add('rimtex')
            if mt.get('outlineWidthMode', 'none') != 'none' and mt.get('outlineWidthFactor', 0) > 0: feats.add('outline')
            if any(mat.get('emissiveFactor', [0,0,0])): feats.add('emissive')
            if any(mt.get(k, 0) for k in ('uvAnimationScrollXSpeedFactor','uvAnimationScrollYSpeedFactor','uvAnimationRotationSpeedFactor')): feats.add('uvanim')
            if mat.get('normalTexture'): feats.add('normal')
    elif 'VRM' in ext:
        spec = '0.x'
        for mp in ext['VRM'].get('materialProperties', []):
            if mp.get('shader') != 'VRM/MToon': continue
            nmat += 1
            fp, tp, vp = mp.get('floatProperties', {}), mp.get('textureProperties', {}), mp.get('vectorProperties', {})
            if '_SphereAdd' in tp: feats.add('matcap')
            if any(vp.get('_RimColor', [0,0,0,0])[:3]): feats.add('rim')
            if '_RimTexture' in tp: feats.add('rimtex')
            if fp.get('_OutlineWidthMode', 0) and fp.get('_OutlineWidth', 0) > 0: feats.add('outline')
            if any(vp.get('_EmissionColor', [0,0,0,0])[:3]) and '_EmissionMap' in tp: feats.add('emissive')
            if any(fp.get(k, 0) for k in ('_UvAnimScrollX','_UvAnimScrollY','_UvAnimRotation')): feats.add('uvanim')
            if '_BumpMap' in tp: feats.add('normal')
    else: continue
    out.append({'id': mid, 'spec': spec, 'mtoon': nmat, 'feats': sorted(feats), 'mb': round(os.path.getsize(vf)/1e6, 1),
                'credit': lic.get('credit'), 'gen': g.get('asset', {}).get('generator')})
    if len(out) >= limit: break
# The sample: every VRM 1.0, every UV-animated and rim-textured model, then 14 more VRM 0.x spread over exporters
# and over rim / outline on and off.
pick = [x for x in out if x['spec'] == '1.0' or 'uvanim' in x['feats'] or 'rimtex' in x['feats']]
buckets = {}
for x in out:
    if x in pick: continue
    key = ((x['gen'] or '?')[:14], 'rim' in x['feats'], 'outline' in x['feats'])
    buckets.setdefault(key, []).append(x)
rest = sorted(buckets.items(), key=lambda kv: -len(kv[1]))
i = 0
while sum(1 for x in pick if x['spec'] == '0.x' and 'uvanim' not in x['feats'] and 'rimtex' not in x['feats']) < 14 and rest:
    k, xs = rest[i % len(rest)]
    if xs: pick.append(xs.pop(0))
    i += 1
    if i > 1000: break
summary = {'scanned': seen, 'eligible': len(out), 'eligibleBySpec': {s: sum(x['spec'] == s for x in out) for s in ('0.x', '1.0')},
           'eligibleFeatures': {f: sum(f in x['feats'] for x in out) for f in ('matcap', 'rim', 'rimtex', 'outline', 'emissive', 'uvanim', 'normal')}}
print(json.dumps({'date': __import__('datetime').date.today().isoformat(), 'filter': 'corporate_commercial_use=allow, is_other_users_available, not R15/R18/adult', 'summary': summary, 'sample': pick}, ensure_ascii=False, indent=1))
