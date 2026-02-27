---
published: true
title: OpenOCD简明指南
date: 2024-07-28 01:07:09
tags: 嵌入式开发
zhihu-title: OpenOCD简明指南
zhihu-topics: 嵌入式 OpenOCD
zhihu-link: https://zhuanlan.zhihu.com/p/711322588
zhihu-cover: "Castorice"
zhihu-updated-at: 2026-01-13 21:59
permalink: concise-guide-openocd/
---
OpenOCD（Open On Chip Debugger）是一个开源的嵌入式调试软件，支持多种SoC、FPGA、CPLD和调试器等，提供了一个优秀的抽象层，使得用户可以通过几乎一致的操作对嵌入式工程进行调试。

本指南仅涉及嵌入式SoC的烧录与调试操作。

有关FPGA和CPLD的使用笔者暂未探索。

<!--more-->

## OpenOCD CLI Options

这里仅介绍常用的若干命令选项

- **`-f` 或 `--file <filename>`**:

  - 指定配置文件。配置文件定义了目标设备、接口和调试器的设置。

  - 示例：`openocd -f board/stm32f4discovery.cfg`

- **`-c` 或 `--command <cmd>`**:

  - 执行指定的命令，然后退出。可以用于执行一系列脚本命令。

  - 示例：`openocd -c "init; reset halt; exit"`

- **`-d` 或 `--debug <level>`**:

  - 设置调试输出级别。级别从0（无调试信息）到3（详细调试信息）。

  - 示例：`openocd -d 3`

- **`-s` 或 `--search <dir>`**:

  - 添加脚本搜索路径。

  - 示例：`openocd -s /path/to/scripts`

- **`--telnet_port <port>`**:

  - 指定Telnet服务器端口，用于调试会话。
  - 示例：`openocd --telnet_port 4444`

- **`--gdb_port <port>`**:

  - 指定GDB服务器端口，用于连接GDB调试器。
  - 示例：`openocd --gdb_port 3333`

- **`--tcl_port <port>`**:

  - 指定TCL服务器端口，用于脚本控制。
  - 示例：`openocd --tcl_port 6666`

把端口指定为disabled将禁用对应服务器。

## OpenOCD Config

在使用OpenOCD对进行编程调试时，需要提供若干cfg文件用于提供信息：

- interface：调试器接口，如ST-Link等；
- board：开发板，如ST-Nucleo系列的开发板等；
- target：嵌入式SoC，如STM32F4等；

interface指明了使用的调试器硬件，target指明了待调试的目标SoC。

特定的board有确定的target和interface，所以board内部一般会直接引用interface和target。

北邮机器人队内部常用两种调试器ST-Link和正点原子DAP-Link和STM32F4系列的MCU，因此有两种典型的配置：

```tcl
# stm32f4 with cmsis-dap
source [find interface/cmsis-dap.cfg]
source [find target/stm32f4x.cfg]
reset_config none
```

```tcl
# stm32f4 with st-link
source [find interface/stlink.cfg]
source [find target/stm32f4x.cfg]
reset_config none
```

- `source <config file>`指的是引入指定的配置文件。
- `find <path>`指的是在特定位置（如OpenOCD的安装目录）搜索指定的配置文件。
- `reset_config`指的是OpenOCD复位指令的行为，常用的选项如下：
  - `srst_only`：仅系统复位，有JTAG门控
  - `srst_nogate`：仅系统复位，无JTAG门控
  - `none`：默认配置，一般来说用这个就好

## OpenOCD Server

OpenOCD启动后会运行三种服务：

- GDB：默认运行在3333端口，GDB调试服务；
- TCL：默认运行在6666端口，TCL脚本服务；
- Telnet：默认运行在4444端口，Telnet服务；

GDB服务用于接入GDB，在GDB中输入`target remote :<port>`即可接入调试；

Telnet服务可以通过Telnet客户端登录，通过手动输入指令的方式进行调试；

TCL服务可以通过Socket连接，执行复杂的TCL脚本进行自动化调试；

## OpenOCD Command

OpenOCD指令众多，官方文档[Documentation (openocd.org)](https://openocd.org/pages/documentation.html)有详细的介绍，由于一般使用GDB进行调试，这里不过多介绍其他指令，仅介绍一些常用的指令：

### Program

```tcl
program <filename> [verify] [reset] [exit] [file_offset] [mem_offset] [bank]
```

- **`<filename>`**:
  - 要编程的文件的路径，可以是二进制文件（\*.bin）、Intel HEX 文件（\*.hex）或 ELF 文件（\*.elf）。
  - bin文件是纯粹的二进制数据，不包含任何包括地址信息在内的其他数据，烧录时必须指定内存偏移；
  - hex文件是文本文件，包含十六进制编码的数据和地址信息，可以直接烧录；
  - elf文件是标准的二进制文件，除了数据及其地址之外，还包含了符号表、调试信息等完整的元数据，可以直接烧录；

- **`verify`**（可选）:
  - 编程后进行校验，确保数据正确写入。

- **`reset`**（可选）:
  - 编程完成后复位目标设备。

- **`exit`**（可选）:
  - 编程完成后退出 OpenOCD。

- **`file_offset`**（可选）:
  - 文件中数据的偏移量，通常用于将部分文件编程到设备。
  - 指定文件偏移时，必须同时指定内存偏移；

- **`mem_offset`**（可选）:
  - 目标设备内存中的偏移地址，指定数据写入的位置。
  - 仅指定一个地址时，该地址被视为内存偏移；

- **`bank`**（可选）:
  - 指定 Flash 存储器的Bank，当设备具有多个 Flash bank 时使用。

**实例：**

```tcl
program firmware.elf verify reset exit
```

烧录firmware.elf，校验并重置目标SoC，完成后退出OpenOCD。

```tcl
program firmware.bin 0x08000000 verify reset exit
```

烧录firmware.bin，从地址0x08000000开始烧录，校验并重置目标SoC，完成后退出OpenOCD

### Reset指令

```tcl
reset [run|halt|init|deassert|assert|none]
```

- **`run`**:

  - 复位目标设备并立即让它运行。这是默认的复位行为。

  - 使用场景：通常用于将设备复位到初始状态并继续运行，例如在固件更新后让设备开始执行新的固件。

- **`halt`**:

  - 复位目标设备并让它在复位后保持暂停状态。

  - 使用场景：在调试时常用，以确保设备在已知状态下暂停，便于检查初始化状态或设置断点。

- **`init`**:

  - 复位目标设备，并在复位后执行初始化步骤。

  - 使用场景：在需要重新初始化调试器和设备状态时使用，确保设备从复位后的已知状态开始。

- **`deassert`**:

  - 取消复位信号，将目标设备从复位状态释放。

  - 使用场景：在需要手动控制复位信号的复杂调试场景中使用。

- **`assert`**:

  - 断言复位信号，使目标设备进入复位状态。

  - 使用场景：在需要手动控制复位信号的复杂调试场景中使用。

- **`none`**:

  - 不进行任何复位操作，通常与 `reset_config` 配置配合使用。

  - 使用场景：当复位行为已通过其他方式配置时使用。

**实例**

```tcl
reset run
```

复位目标SoC，使之开始运行；

```
reset halt
```

复位目标SoC，暂停于复位向量处；

```tcl
reset init
```

复位目标SoC，执行到某个被指定的位置（完成初始化），相当于保证设备处于已初始化的稳定态；

## 实践指导

### 烧录

```sh 
openocd -f <config-file> -c 'program <firware-file> verify reset exit' 
```

### 调试

```sh
openocd -f <config-file> -c 'program <firware-file> verify reset' -c 'init; reset init;'
```

- program指令是可选的，但是笔者认为一般还是重新烧录比较稳妥（以防忘记烧录新固件）；
- init指令和reset指令是可选的，但是执行一次复位之后可以确保设备与调试器均处于稳定态；

- 可以通过指令指定服务器端口，参考第一节；

此后，启用调试有三种方法：

- 使用telnet连接openocd
- 连接tcl服务器执行tcl脚本
- 使用gdb，连接远程目标到openocd的gdbserver





































