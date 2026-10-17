#!/bin/sh
# Builds the NDI-out spike (macOS only). Output: ./ndi-out-spike (git-ignored scratch binary).
cd "$(dirname "$0")" && swiftc -O -swift-version 5 -import-objc-header ndi_shim.h NdiOutSpike.swift -o ndi-out-spike
