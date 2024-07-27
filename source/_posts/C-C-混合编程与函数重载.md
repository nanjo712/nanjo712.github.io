---
title: C/C++混合编程与函数重载
date: 2024-04-23 18:46:28
tags: C/C++
---

C++相比于C，额外支持了函数重载。

为了更好地进行C/C++混合编程，具体地理解这一机制是必要的。

考察一个经典的C++程序编译过程，一般来说，这可以被分为四个过程：预编译、编译、汇编、链接。

函数重载的相关过程主要发生在编译期。

<!--more-->

### 编译期：重载决议与名称修饰

除了常规的词法分析等工作，C++在编译期还有一项额外的工作：重载决议。

重载决议的含义是显而易见的：在所有同名的函数实现中，选择匹配最佳的一个作为实际调用的函数。

这个过程中的匹配规则是涉及到相当多的规则，对此的讨论可以单开一篇文章，这里不过多涉及

*事实上，重载决议的匹配规则设计相当优秀，以至于多数情况下你不需要了解其具体机制也足以让其按照你的设想工作。*

也就是说，程序在涉及到重载的部分实际调用的程序，在编译阶段已经被确定。

注意到这样一个事实：编译器会为所有被定义的标识符（函数、变量）生成实际的符号名称。

但是重载函数的集合实际上具有相同的名称，为了区分这些函数，C编译器和C++编译器具有不同的行为。

具体地，对于C编译器来说，所有标识符的实际符号名称往往与标识符本身的名称（函数名、变量名）相同（大多数情况下如此，即使有例外，名称也会非常接近）；对于C++编译器，所有标识符的实际符号名称除了会携带标识符本身的名称之外，还会带有其他的信息，比如参数类型、命名空间等。

简单来说，对于`int add(int a,int b)`这样一个函数签名，你可以认为C编译器生成的符号是`add()`，C++编译器生成的符号是`add(int,int)`。

实际情况由于涉及模板、类等问题，会比这个复杂很多。只需要理解一点，C++为每一个函数都生成了独一无二的标识符，同名函数的不同重载形式会被映射到到不同的符号名称上。

看似同名的函数，其实在编译器眼中并不相同。

**综上所述，我们可以做出这样的总结：编译器为函数的所有重载形式生成不同的符号名称；对于一个函数调用，编译器根据匹配规则决定其实际调用的函数实现，并将原本的函数名转换为对应的符号名称。**

### 链接期：符号解析

在代码中使用函数、变量被称为一次引用。为了处理这些引用，这些引用在编译期被替换为符号名称，链接器需要将它们与实际的实现关联起来，这一过程被称为链接。链接的规则是复杂的，但是我们可以先避开复杂的细节，基于下面的假设展开讨论：

- 同名的符号会被关联到具体的实现上；
- 同名的符号仅有唯一的实现；

这两条假设在大多数情况下是正确且直观的，这对于我们理解函数重载的过程已经很足够了。

事实上，这两条假设保证了链接器选择的唯一性。

我们逐一讨论每一条假设的意义：

- 假设所有同名的符号不存在一份实现，则会有”undefined reference“错误，即所谓未定义的引用；
- 假设同名的符号具有两份相同的实现，则会有”multiple definition“（链接期）或者”redefinition“（编译期）

注意到这样一个事实，源代码中同名的函数实际上已经在经过名称修饰后不再同名。所以，每一个函数实际上都具有独一无二的符号名称。可以认为，在链接期时不应该存在同名的符号了。

### 实践指导

C++为了保持语言兼容性，提供了额外的关键字`extern "C"{ /** some code here **/ }`，在这个代码块中所有标识符（函数、变量）的声明都会被按照C的方式被处理，不做任何修饰（所谓按照C的方式被声明）。于是，C的代码也可以正常调用这部分标识符。

**这意味着，在你的C++代码中，所有暴露给C语言调用的接口应该被包含于`extern "C"`中。**

**对于使用C语言开发的库，如果需要被C++调用，那么在C++代码中就需要被以C的方式声明。**

为了支持这一点实际上并不难，开发者完全可以利用宏来解决这一点。

```c
#ifndef _A_H
#define _A_H

#ifdef __cplusplus
extern "C"{
#endif /* __cplusplus__ */

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <math.h>

typedef struct
{
    /* some code here */
} A;

void foo(int);
void bar();

#ifdef __cplusplus
}
#endif /* __cplusplus__ */
    
#endif /* _A_H */
```

我们在一个经典的头文件中加入了`__cplusplus`控制编译的`extern "C"`块。

需要知道这样一个事实——C++源文件会在自己的文件中隐式地定义一个宏`__cplusplus`。也就是说，当这份头文件被C++源文件包含时，`extern "C"`就会被加入头文件中参与编译。

我们可以考察如果没有`extern "C"`会产生什么后果：

假设我们有一个库A，有两个文件：`A.h`和`A.c`。.h头文件中含有库A中的函数声明和一些类型定义，.c中有这些函数的实现。注意，源文件是.c格式的，这里所有的符号都不会经过名称修饰，例如`foo`的符号应该就是`foo`。

现在，我们写了一份`main.cpp`文件，其中包含了`A.h`，于是`A.h`中声明的所有符号都会经过名称修饰。

不妨假设`main.cpp`调用了`foo(1)`，那么经过名称修饰后，其符号可以认为是`foo(int)`。

于是链接器会去寻找`foo(int)`的实现，关联到`main.cpp`上，但是由于`A.c`是按照C格式被编译，其中的实现所有的符号都没有经过修饰，那么链接器就无法寻找到`foo(int)`——因为实际上它的实现的符号是`foo`。这就是链接器报错`undefined reference`的原因之一。

所以，在C实现的库的头文件中加入`extern "C"`块往往是必要的。

**`extern "C"`是C++关键字，纯C环境中不存在这个关键字，因此需要被包含于条件编译块中。**

除此之外，对于嵌入式平台来说，如我们常用的STM32，它提供了启动时的`statup.s`，用汇编描述了启动流程，做了必要的初始化，引用函数构成向量表，如复位处理、硬错误处理、中断服务函数等。它负责将这些函数放到一个正确的地址上，以便MCU自动调用这些函数。

**因此，这些函数也应该确保将被按照以C方式被声明。你可以简单地认为，`startup.s`中的所有引用的函数都应该被按照C的方式被声明。**

以下给出了F405的向量表的一部分，具体可以参考CubeMX自动生成的startup.s

```assembly
g_pfnVectors:
  .word  _estack
  .word  Reset_Handler

  .word  NMI_Handler
  .word  HardFault_Handler
  .word  MemManage_Handler
  .word  BusFault_Handler
  .word  UsageFault_Handler
  .word  0
  .word  0
  .word  0
  .word  0
  .word  SVC_Handler
  .word  DebugMon_Handler
  .word  0
  .word  PendSV_Handler
  .word  SysTick_Handler
  
  /* External Interrupts */
  .word     WWDG_IRQHandler                   /* Window WatchDog              */                                        
  .word     PVD_IRQHandler                    /* PVD through EXTI Line detection */                        
  .word     TAMP_STAMP_IRQHandler             /* Tamper and TimeStamps through the EXTI line */            
  .word     RTC_WKUP_IRQHandler               /* RTC Wakeup through the EXTI line */                      
  .word     FLASH_IRQHandler                  /* FLASH                        */                                          
  .word     RCC_IRQHandler                    /* RCC                          */                                            
  .word     EXTI0_IRQHandler                  /* EXTI Line0                   */                        
  .word     EXTI1_IRQHandler                  /* EXTI Line1                   */                          
  .word     EXTI2_IRQHandler                  /* EXTI Line2                   */                          
  .word     EXTI3_IRQHandler                  /* EXTI Line3                   */                          
  .word     EXTI4_IRQHandler                  /* EXTI Line4                   */                          
  .word     DMA1_Stream0_IRQHandler           /* DMA1 Stream 0                */                  
  .word     DMA1_Stream1_IRQHandler           /* DMA1 Stream 1                */                   
  .word     DMA1_Stream2_IRQHandler           /* DMA1 Stream 2                */                   
  .word     DMA1_Stream3_IRQHandler           /* DMA1 Stream 3                */                   
  .word     DMA1_Stream4_IRQHandler           /* DMA1 Stream 4                */                   
  .word     DMA1_Stream5_IRQHandler           /* DMA1 Stream 5                */                   
  .word     DMA1_Stream6_IRQHandler           /* DMA1 Stream 6                */                   
  .word     ADC_IRQHandler                    /* ADC1, ADC2 and ADC3s         */                   
  .word     CAN1_TX_IRQHandler                /* CAN1 TX                      */                         
  .word     CAN1_RX0_IRQHandler               /* CAN1 RX0                     */                          
  .word     CAN1_RX1_IRQHandler               /* CAN1 RX1                     */                          
  .word     CAN1_SCE_IRQHandler               /* CAN1 SCE                     */                          
  .word     EXTI9_5_IRQHandler                /* External Line[9:5]s          */                          
  .word     TIM1_BRK_TIM9_IRQHandler          /* TIM1 Break and TIM9          */         
  .word     TIM1_UP_TIM10_IRQHandler          /* TIM1 Update and TIM10        */         
  .word     TIM1_TRG_COM_TIM11_IRQHandler     /* TIM1 Trigger and Commutation and TIM11 */
  .word     TIM1_CC_IRQHandler                /* TIM1 Capture Compare         */                          
  .word     TIM2_IRQHandler                   /* TIM2                         */                   
  .word     TIM3_IRQHandler                   /* TIM3                         */                   
  .word     TIM4_IRQHandler                   /* TIM4                         */                   
  .word     I2C1_EV_IRQHandler                /* I2C1 Event                   */                          
  .word     I2C1_ER_IRQHandler                /* I2C1 Error                   */                          
  .word     I2C2_EV_IRQHandler                /* I2C2 Event                   */                          
  .word     I2C2_ER_IRQHandler                /* I2C2 Error                   */                            
  .word     SPI1_IRQHandler                   /* SPI1                         */                   
  .word     SPI2_IRQHandler                   /* SPI2                         */                   
  .word     USART1_IRQHandler                 /* USART1                       */                   
  .word     USART2_IRQHandler                 /* USART2                       */                   
  .word     USART3_IRQHandler                 /* USART3                       */                   
  .word     EXTI15_10_IRQHandler              /* External Line[15:10]s        */                          
  .word     RTC_Alarm_IRQHandler              /* RTC Alarm (A and B) through EXTI Line */                 
  .word     OTG_FS_WKUP_IRQHandler            /* USB OTG FS Wakeup through EXTI line */                       
  .word     TIM8_BRK_TIM12_IRQHandler         /* TIM8 Break and TIM12         */         
  .word     TIM8_UP_TIM13_IRQHandler          /* TIM8 Update and TIM13        */         
  .word     TIM8_TRG_COM_TIM14_IRQHandler     /* TIM8 Trigger and Commutation and TIM14 */
  .word     TIM8_CC_IRQHandler                /* TIM8 Capture Compare         */                          
  .word     DMA1_Stream7_IRQHandler           /* DMA1 Stream7                 */                          
  .word     FSMC_IRQHandler                   /* FSMC                         */                   
  .word     SDIO_IRQHandler                   /* SDIO                         */                   
  .word     TIM5_IRQHandler                   /* TIM5                         */                   
  .word     SPI3_IRQHandler                   /* SPI3                         */                   
  .word     UART4_IRQHandler                  /* UART4                        */                   
  .word     UART5_IRQHandler                  /* UART5                        */                   
  .word     TIM6_DAC_IRQHandler               /* TIM6 and DAC1&2 underrun errors */                   
  .word     TIM7_IRQHandler                   /* TIM7                         */
  .word     DMA2_Stream0_IRQHandler           /* DMA2 Stream 0                */                   
  .word     DMA2_Stream1_IRQHandler           /* DMA2 Stream 1                */                   
  .word     DMA2_Stream2_IRQHandler           /* DMA2 Stream 2                */                   
  .word     DMA2_Stream3_IRQHandler           /* DMA2 Stream 3                */                   
  .word     DMA2_Stream4_IRQHandler           /* DMA2 Stream 4                */                   
  .word     0                                 /* Reserved                     */                   
  .word     0                                 /* Reserved                     */                     
  .word     CAN2_TX_IRQHandler                /* CAN2 TX                      */                          
  .word     CAN2_RX0_IRQHandler               /* CAN2 RX0                     */                          
  .word     CAN2_RX1_IRQHandler               /* CAN2 RX1                     */                          
  .word     CAN2_SCE_IRQHandler               /* CAN2 SCE                     */                          
  .word     OTG_FS_IRQHandler                 /* USB OTG FS                   */                   
  .word     DMA2_Stream5_IRQHandler           /* DMA2 Stream 5                */                   
  .word     DMA2_Stream6_IRQHandler           /* DMA2 Stream 6                */                   
  .word     DMA2_Stream7_IRQHandler           /* DMA2 Stream 7                */                   
  .word     USART6_IRQHandler                 /* USART6                       */                    
  .word     I2C3_EV_IRQHandler                /* I2C3 event                   */                          
  .word     I2C3_ER_IRQHandler                /* I2C3 error                   */                          
  .word     OTG_HS_EP1_OUT_IRQHandler         /* USB OTG HS End Point 1 Out   */                   
  .word     OTG_HS_EP1_IN_IRQHandler          /* USB OTG HS End Point 1 In    */                   
  .word     OTG_HS_WKUP_IRQHandler            /* USB OTG HS Wakeup through EXTI */                         
  .word     OTG_HS_IRQHandler                 /* USB OTG HS                   */                   
  .word     0                                 /* Reserved                         */                   
  .word     0                                 /* Reserved                  */                   
  .word     HASH_RNG_IRQHandler               /* Hash and Rng                 */
  .word     FPU_IRQHandler                    /* FPU                          */
```









