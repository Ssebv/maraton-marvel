#!/bin/sh
# Corre las pruebas del paquete. Sin Xcode (solo Command Line Tools), Swift
# Testing no encuentra sus macros ni su framework: se le pasan las rutas.
cd "$(dirname "$0")"
CLT=/Library/Developer/CommandLineTools
if xcode-select -p 2>/dev/null | grep -q CommandLineTools; then
  F=$CLT/Library/Developer/Frameworks
  exec swift test -Xswiftc -plugin-path -Xswiftc $CLT/usr/lib/swift/host/plugins/testing \
    -Xswiftc -F -Xswiftc $F -Xlinker -rpath -Xlinker $F "$@"
fi
exec swift test "$@"
