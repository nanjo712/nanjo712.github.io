---
title: OpenOCD-Tools使用文档
date: 2024-07-28 20:38:16
tags: 嵌入式
zhihu-title: OpenOCD-Tools使用文档
zhihu-topics: 嵌入式 OpenOCD
zhihu-link: https://zhuanlan.zhihu.com/p/711429569
zhihu-cover: "Evernight"
zhihu-updated-at: 2026-01-13 21:57
permalink: openocd-tools-user-manual/
published: true
---
OpenOCD Tools是一个将OpenOCD与VSCode集成的小型插件，封装了OpenOCD的烧录和调试操作。

6.11版本之后的CubeMX引入了对CMake的原生支持，可以直接通过CubeMX直接配置生成CMake工程。

当前版本该插件仅支持类STM32 MCU的CMake工程。

功能特性：

- 一键烧录调试固件
- 自动扫描固件文件
- 自动识别MCU，根据选择的调试器生成OpenOCD Config文件

**如有更多的功能需求，请在[代码仓库](https://github.com/nanjo712/openocd-tools)中发起Issue。**

<!--more-->

## 依赖

CMake Tools：为了确保烧录前固件是最新版本，需要调用CMake进行编译。

## 界面介绍

打开一个STM32CubeMX配置的CMake工程，将激活拓展。

{% img https://raw.githubusercontent.com/nanjo712/PicGoRepo/master/image-20240728211919585.png '"" "VSCode-侧边栏"' %}

- MCU-Family：从IOC文件中读取的MCU族；
- Debugger：选择一个Debugger，目前仅有三个选项stlink、cmsis-dap（dap-link）、jlink；
- CFG File：OpenOCD的配置文件，可以选择自己编写的配置文件，也可以根据MCU-Family和Debugger的设置自动生成；
- Target File：待烧录的固件文件，目前仅支持ELF文件烧录，可以通过CMake构建生成；
- SVD File：描述MCU外设寄存器地址的文件，一般由MCU厂商提供，STM32的SVD文件与CubeProgrammer打包分发。该配置项目可选，未配置该项则会在无外设视图的情况下启动调试；
- Flash：烧录固件；
- Debug：调试固件；

## 使用流程

- 打开STM32工程，插件自动检测MCU；
- 选择使用的调试器，如stlink；
- 点击生成CFG文件，在工作区目录下将生成一个openocd.cfg文件；如果需要自定义，可以自行更改该文件，或者点击CFG file选项选择一个CFG文件；
- 选择目标文件，点击之后插件将扫描目录内所有ELF文件，选择需要烧录或者调试的固件；
- 点击Flash进行烧录，或者点击Debug进行调试

## 更好的调试支持

以下插件可以带来更好的调试体验，用户可以根据需要任意选择，与OpenOCD Tools一起使用。

- Embedded Tools拓展：RTOS视图和外设试图
- RTOS Views：RTOS视图
- Peripheral Viewer：外设视图







