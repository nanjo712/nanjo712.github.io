---
title: std::chrono用法解析
date: 2024-01-27 22:41:49
tags: C/C++
---
# std::chrono用法解析

`std::chrono`是C++11引入的一个全新的有关时间处理的库。

新标准以前的C++往往会使用定义在`ctime`头文件中的C-Style时间库`std::time`。

相较于旧的库，`std::chrono`完善地定义了时间段（duration）、时钟（clock）和时间点（time point）三个概念，并且给出了对多种时间单位的支持，提供了更高的计时精度、更友好的单位处理以及更方便的算术操作（以及更好的类型安全）。

下面，我们将逐步说明`std::chrono`用法。

Tips：本文参考的库代码主要来自MSVC，少部分来自GCC

## chrono库概念与相关用法

### 时间段（duration）

时间段被定义为`std::chrono::duration`，表示一段时间。

它的签名如下：

```cpp
template<
    class Rep,
    class Period = std::ratio<1>
> class duration;
```

`Rep`是一个算术类型，表示tick数的类型，笔者一般会将其定义为`int`或者`long long`等整数类型，当然浮点数类型也是可行的。

`Period`代表tick的计数周期，它具有一个默认值——以一秒为周期，即 $1$ $\mathrm{tick}/\mathrm{s}$。单位需要自行指定的情况会在后面涉及，这里暂时不讨论。

简单来说，我们可以认为一个未指定`Period`的`duration`是一个以秒为单位的时间段。



一个简单的例子：

```cpp
#include <chrono>
#include <thread>
#include <iostream>
int main()
{
    std::chrono::duration<int> dur(2);
    std::cout << std::chrono::time_point_cast<std::chrono::seconds>
                (std::chrono::steady_clock::now())
                .time_since_epoch().count() << std::endl; // 以秒为单位输出当前时间
    std::this_thread::sleep_for(dur);
    std::cout << std::chrono::time_point_cast<std::chrono::seconds>
                (std::chrono::steady_clock::now())
                .time_since_epoch().count() << std::endl; // 以秒为单位输出当前时间
    return 0;
}
```

这段代码的作用是输出当前时间，随后睡眠两秒，再输出当前时间。`dur`描述了一个2秒的时间间隔。

`duration`支持几乎所有的算术运算。通俗地说，你可以对两个`duration`做加减运算，也可以对某个`duration`做数乘运算。

#### 时间单位

一般地，在未经特殊指定的情况下，我们认为C++以秒为默认单位。

为了方便地引入其他单位，我们会使用`std::ratio`，有关它的具体行为可以参考[std::ratio Documentation](https://en.cppreference.com/w/cpp/numeric/ratio/ratio)。在这篇文章中，我们只需要知道它是一个表示常数比例的类型，并且它是一个编译期常量。

下表给出了一些SI单位制中常用的比例，C++的标准库提供了这些比例的语法糖。

![image-20240126001319598](https://raw.githubusercontent.com/nanjo712/PicGoRepo/master/image-20240126001319598.png)

基于这份比例表，C++标准库为我们常用的时间单位提供了一些语法糖

![image-20240126002441567](https://raw.githubusercontent.com/nanjo712/PicGoRepo/master/image-20240126002441567.png)

笔者在这里简单翻译一下图中的文字说明：

>int XX是指这个类型的tick数类型是一个至少具有XX位的有符号整数
>
>到hours为止每个预定义类型至少可以覆盖±292年。
>
>C++20中引入的days、weeks、months和years的单位至少可以覆盖±40000年。一年被定义为365.2425天（格里高利年的平均长度），一月被定义为30.436875天（一年的十二分之一）。

定义在`std::chrono`的时间单位事实上是一个`duration`，描述一个时间段。因此我们容易见得：

```cpp
std::chrono::duration<long long> dur1(2);
std::chrono::seconds dur2(2);
```

这一段代码中的`dur1`和`dur2`应该是等价的。

为了简化使用并且增强可读性，在没有特殊单位需求的情况下，笔者建议使用第二种方式定义时间段。

当然，引入`std::ratio`为我们自定义时间单位带来了可能性。

一个例子：

现在， 出于一种不可明说理由，我们引入了一个新的时间单位，记作$\mathrm{A}$，其中$1\mathrm{A}=500\mathrm{ms}$。为了描述使用这个单位记录的`duration`，我们可以这样定义：

```cpp
std::duration<long long,std::ratio<1,2>> dur; // 1/2s=0.5s=500ms
```

这样就实现了自定义单位的需求。

当然，`duration`的单位转换也是支持的，只需要使用`duration_cast`即可。

```cpp
std::chrono::duration_cast<std::chrono::nanoseconds>(dur)
```

这个表达式将返回一个新的`duration`，时间长度保持一致，但是其单位将会是纳秒。

### 时钟（clock）

时钟由两部分构成，分别是起始点（starting point or epoch）和计时频率（tick rate）。

一个简单的例子是Unix时间戳，我们可以将其视为一个起点为1970年1月1日，计时频率为 $1$ Hz（ $1$ tick/s）的时钟。

C++11中提供了三种时钟，包括system_clock、steady_clock、high_resolution_clock. 这些时钟的now方法均会返回当前的时间点（time point），即从起始点开始的tick数。

_注意，这三个时钟都不会考虑闰秒，我们会暂时略过相关内容的讨论，在必要时我们会简要说明不考虑闰秒的原因_

#### system_clock

顾名思义，这是一个系统时钟，表示操作系统的实时时间。

需要注意的是，这个时钟的单调性是不被保证的。原因是显而易见的：用户或者系统可以在任何时候出于任何理由（夏令时调整、时区调整等）改变系统时间。因此它实际上表示了现实世界的时钟（wall clock，墙上时钟），这个时钟很适合直接记录和计划与现实时间直接相关的任务。

需要注意的是，C++20以前的标准并没有具体规定system_clock的实现。但是，多数system_clock的实现都使用Unix时间。

不过，在C++20之后，system_clock的实现就被规定为Unix时间了。

另外，这是唯一一个可以和C风格的`std::time`的时间戳构成双射的时钟，因此`std::chrono`中提供了`to time_t`和`from time_t`两个方法。

#### steady_clock

这一时钟与system_clock最大的不同就是单调性。system_clock由于直接与现实时间相关联，因此单调性无法保证。但是steady_clock是一个稳定的时钟源，它的now方法返回的时间总是单调递增的，并且每个tick之间的时间差总是一个常数。

一个值得注意的地方是，这个时钟的计时起点是未指定的。

> This clock is not related to wall clock time (for example, it can be time since last reboot), and is most suitable for measuring intervals.
>
> <p align='right'>From <a href="https://en.cppreference.com/w/cpp/chrono/steady_clock">std::chrono::steady_clock</a></p>

这样的设计是有意而为之的——这一时钟并不被设计在表示日历时间的场景中使用。如上方所说，这一时钟最合适的用途是用于测量时间间隔（作为定时器的时钟源）。

#### high_resolution_clock

这一时钟是当前平台分辨率最高的时钟，其实际精度和分辨率一般取决于具体的平台。事实上，在大多数的实现中，这一时钟只是system_clock和steady_clock的别名——因此其单调性也几乎无法保证。

截至笔者完成本文的时间GCC的标准库libstdc++中high_resolution_clock是system_clock的别名，而MSVC的标准库中high_resolution_clock是steady_clock的别名，LLVM的标准库libc++对这一时钟的定义则是两者的复合体——在具有单调时钟时使用steady_clock，否则使用system_clock。

如果你的程序中使用了这个时钟并且有跨平台的需求，这将带来程序行为不一致的风险。

除非你认为非常有必要，否则我们建议减少对这个时钟的使用。

#### 为什么不讨论闰秒？

**如果你不关心这个问题，你可以跳过这一段。**

在前面提到过，这样的设计是有意而为之。因为闰秒并不像我们所说的闰年一样，具有一个可计算的公式。

如果将地球自转一周的时间均分为86400份，将一份定义为一秒，我们就得到了秒的一种定义，根据这种秒的定义所得到的时间我们记为**世界时UT1**。

但是地球自转一周的时间是不稳定的，这一点不展开讨论，我们只需要知道它是客观存在的。因此，我们需要更稳定的秒的定义——铯-133原子基态的两个超精细结构能级之间跃迁相对应辐射周期的9192631770倍所持续的时间定义为一秒。由这种方法计量的时间我们记为**原子时TAI**。

世界时是符合人类直观，具有直接指导生产意义的时间，但是具有不稳定性。原子时稳定，但是由于地球自转的不稳定性，会与世界时形成不小的误差。

为了弥补这个误差，我们引入一种新的时间，也就是我们现在常用的时间——**协调世界时UTC**。

它以TAI为基础，为了避免误差累积，每当UTC和UT1的误差接近1秒时，就会插入闰秒以修补这个误差。但是插入的时间并不确定，事实上，它由对应的国际组织提前六个月发布处理。

作为一个编程语言，C++不具备预测人类活动或者地球自转快慢的能力，因此不考虑闰秒是一个正常的选择。这个问题被交给程序员来解决。

_截至目前，由于插入闰秒的做法带来了很多破坏性的影响，已有提案声明要求取消闰秒。预计在2035年后，不再引入新的闰秒。_

### 时间点（time_point)

时间点的意义是自然的，它代表时间轴上的一个点。为了定义它，你需要提供一个时钟作为参考系，一个tick数标记这个`time_point`代表的点。一般的实现是作为一个特殊的`duration`，简单来说，它是一个起点固定的`duration`（固定为指定时钟的起始点）。因此，它的构造方法就是提供一个时钟，并且提供一个`duration`代表具体时钟起点的长度。

_当然这不意味着这两个类具有继承关系。事实上，这是一种帮助理解的说法。_

它的签名如下：

```cpp
template<
    class Clock,
    class Duration = typename Clock::duration
> class time_point;
```

一个简单的例子：

```cpp
std::chrono::time_point<std::chrono::system_clock> 
    start(std::chrono::duration<int>(10));
```

这段代码定义了一个名为`start`的时间点，标记了1970年1月1日0时0分10秒（Unix时间起点+10s）的时间点。

可以这样看，我们提供了`system_clock`作为模板参数，这代表着这个时间点以`system_clock`为参考系，我们传入一个长度为10s的`duration`表示我们需要标记system_clock纪元（epoch）10秒后的一个点。

当然，也有这样的定义方法

```cpp
std::chrono::system_clock::time_point start(std::chrono::duration<int>(10));
```

这两者是等价的。

因为time_point是特殊的duration，因此它也可以进行一些算术操作，

值得注意的是，由于time_point的实际含义是一个点，对一个点的数乘是无意义的，所以time_point并不能支持数乘运算。

其他的加减操作是符合直观的，概括地说：

- 时间点和时间段相加减得到新的时间点。
- 时间点与时间点相减得到新的时间段。

## 简化的表示——chrono_literals的使用

`chrono_literals`是`std::literals`的一个子命名空间，引入这个命名空间之后我们可以简化时间的表示。

一个例子是：我们可以用`10s`等价代替`std::chrono::seconds(10)`。

![image-20240127222748419](https://raw.githubusercontent.com/nanjo712/PicGoRepo/master/image-20240127222748419.png)

C++认为`10s`是一个字面量（literal），代表`std::chrono::seconds(10)`，正如一个不带后缀的字面量`10`代表一个int类型的整数10一样。

```cpp
using namespace std::literals::chrono_literals;
std::chrono::system_clock::time_point start(10s);
```

于是，我们有了这样更加直观的写法。

## 参考资料

[Date and time utilities - cppreference.com](https://en.cppreference.com/w/cpp/chrono)

[闰秒 - 维基百科，自由的百科全书 (wikipedia.org)](https://zh.wikipedia.org/wiki/闰秒)











