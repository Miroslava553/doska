#!/bin/bash
# fz.sh <dev> <steps> <seeds...>
dev=$1; steps=$2; shift 2
for s in "$@"; do timeout 1200 python3 /home/claude/board/test/fuzz.py $s $steps $dev $ROLE 2>&1 | python3 -c "
import json,sys
raw=sys.stdin.read()
try: d=json.loads(raw[raw.index('{'):])
except Exception: print('СБОЙ', raw[-800:]); sys.exit()
print('seed', d['seed'], d['dev'], d['role'], d['sec'],'s', len(d['problems']),'проблем')
for p in d['problems']: print(' -', p['kind'], p['msg'][:220]); print('    ', ' | '.join(p['last'][-7:])); print('    ', p['shot'])"; done
