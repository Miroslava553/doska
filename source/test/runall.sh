#!/bin/bash
# runall.sh <out> <tests...>
out=$1; shift; : > $out
for f in "$@"; do r=$(timeout 300 python3 $f 2>&1 | grep -v -i "deprecat\|getdata\|return sum" | tail -4 | tr '\n' ' ' | cut -c1-400); echo "$f :: $r" >> $out; done
echo DONE >> $out
