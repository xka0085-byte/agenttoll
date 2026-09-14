#!/usr/bin/env sh
set -eu
name="${1:-agenttoll}"
[ "$name" = agenttoll ] || { printf '%s\n' 'usage: ./audit.sh agenttoll' >&2; exit 2; }
pass=0
fail=0
check() {
    if "$@"; then
        pass=$((pass + 1))
        printf '%s\n' PASS
    else
        fail=$((fail + 1))
        printf '%s\n' FAIL
    fi
}
check test -f target/deploy/agenttoll.so
check test -f target/idl/agenttoll.json
check cargo test --all
check sh -c "! grep -R -n -E 'unwrap\\(\\)|expect\\(|panic!\\(' programs/agenttoll/src"
check sh -c "grep -R -n 'RECEIPT_SEED' programs/agenttoll/src"
check sh -c "! grep -R -n -E 'BEGIN (OPENSSH|RSA|EC) PRIVATE KEY|mnemonic|secretKey' --exclude-dir=.git --exclude-dir=target ."
check sh -c "! grep -R -n 'C:\\\\Users\\\\\|/Users/' --exclude-dir=.git --exclude-dir=target ."
printf '%s PASS / %s FAIL\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
