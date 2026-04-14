---
zhihu-title: CIRCT——打印相关拓展
zhihu-topics: CIRCT MLIR
zhihu-link: https://zhuanlan.zhihu.com/p/2027535244069279422
zhihu-created-at: 2026-04-14 23:54
zhihu-updated-at: 2026-04-15 00:01
title: CIRCT——打印相关拓展
date: 2026-04-14 23:10:04
tags:
  - CIRCT
permalink: circt-printing-related-extensions/
published: true
---
## 主线任务

目前FIRRTL中打印相关的操作会被直接降级到SV Dialect。为了避免非SV后端被迫解析SV后端特有的语义，需要将FIRRTL中打印相关的操作降级到Sim Dialect，在SimToSV的阶段再将Sim Dialect中打印的操作降级为SV，保持FIRRTL -> SV端到端行为不变。
## Pending PR
<!--more-->

- [[FIRRTLToHW] Lower FIRRTL prints to Sim](https://github.com/llvm/circt/pull/10153)
- [[Sim] Implement the lowering logic from sim.proc.print to the SV dialect](https://github.com/llvm/circt/pull/10172)
- [[Sim] Add cascade erase for print/proc.print format/get_file producer chains](https://github.com/llvm/circt/pull/10204)
- [[ExportVerilog] Migrate the tests for sv.fwrite and sv.write to sv-dialect.mlir](https://github.com/llvm/circt/pull/10205)
- [[Sim] Add builtin stdout/stderr stream ops](https://github.com/llvm/circt/pull/10206)

## Merged PR

- [[Sim] Add output-stream support and introduce sim.get_file](https://github.com/llvm/circt/pull/10163)
- [[SV][ExportVerilog] Add sv.write for no-stream writes](https://github.com/llvm/circt/pull/10179)

## Closed PR

- [[FIRRTLToHW] Lower FIRRTL prints to Sim and migrate SV lowering logic to SimToSV](https://github.com/llvm/circt/pull/10140)
	- 过于重型，review压力太大，搁置。
- [[Sim][SimToSV] Supplementing the infrastructure for Sim dialects](https://github.com/llvm/circt/pull/10146)
	- 过于重型，review压力太大，搁置。

## 任务清单

- ~~引入表示输出流的sim类型（[#10163](https://github.com/llvm/circt/pull/10163)）~~ ✅️
- ~~引入表达打开文件的sim操作（[#10163](https://github.com/llvm/circt/pull/10163)）~~✅️
- 引入表达stdout和stderr的sim操作（[#10206](https://github.com/llvm/circt/pull/10206))
- ~~为没有显式指定流的打印操作引入表达`$write`的sv操作（[#10179](https://github.com/llvm/circt/pull/10179)）~~✅️
	- 维护者指出最好把测试集中在一个文件里面（[#10205](https://github.com/llvm/circt/pull/10205)）
- 实现`sim.proc.print`的降级逻辑（[#10172](https://github.com/llvm/circt/pull/10172)）
	- 为了删除`sim.proc.print`被删除后不再被引用的`sim.fmt.*/sim.get_file`，需要跑一次DCE，但是这些不再被引用的死操作不一定在同一个region中，而`mlir::runRegionDCE`是一个region-local的操作，导致目前的实现需要向上查找顶层过程块。引入一个工具函数，用于级联删除`sim.print`和`sim.proc.print`被删除后不再被引用的`sim.fmt.*/sim.get_file`。([#10204](https://github.com/llvm/circt/pull/10204))
- 为sim.print和sim.proc.print等带副作用的语句建模顺序语义
	- 添加一个token参数，利用token构建数据依赖？
