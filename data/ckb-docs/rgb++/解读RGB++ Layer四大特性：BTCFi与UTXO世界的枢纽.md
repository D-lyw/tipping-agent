# 解读RGB++ Layer四大特性：BTCFi与UTXO世界的枢纽

本月 2024 年 7 月 RGB++ Layer 的发布，标志着此前发布的 RGB++ 协议从理论彻底走向了落地产品，而 RGB++ Layer 的上线也为平台在 BTC、CKB、Cardano 等泛 UTXO（未使用交易输出）公链上构建 BTCFi 生态的宏伟愿景埋下了伏笔，也为平台引入了更加具体、实用的场景，成为无数人关注的焦点。

RGB++ Layer 基于 RGB++ 协议，通过同构绑定和 Leap 为 BTC、CKB、Cardano 等 UTXO 类型公链之间 RGB++ 原生资产或铭文/符文提供“无桥接”的跨链交互体验。利用 CKB 图灵完备的智能合约环境，构建比特币发行资产、实现复杂 DeFi 功能的必要条件。考虑到 CKB 完备的账户抽象生态为其背书，兼容比特币账户和钱包，也为 BTCFi 的大规模采用铺平了道路。

本文旨在帮助您理解 RGB++ 层的一般工作原理和功能特性。它还根据其四个独特特性重点介绍了该层将为 BTCFi 生态系统带来的变化。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-xu932x8.jpeg?auto=format&fit=max&w=3840)

## 1\. RGB++协议作为RGB++层的理论基础

RGB++ 协议于今年 1 月发布，将 RGB 协议的“客户端验证”替换为 CKB 链上验证，使用 CKB 作为去中心化的 Indexer，将数据存储、资产来源验证等工作委托给 CKB，CKB 作为 RGB 协议的验证层和数据可用性（DA）层，帮助解决 RGB 协议中未花费交易（UX）问题和 DeFi 场景不利缺陷。

RGB++的同构绑定秉承“一次封装”的理念，以CKB链上的扩展UTXO——Cell作为铭文/符文类资产的数据载体，与比特币链上的UTXO建立绑定关系，从而继承比特币的安全性。

比如 Alice 想要转一些 TEST 代币给 Bob，她可以生成一个声明，将存储 TEST 资产信息的 Cell 绑定到 Bob 的一个比特币 UTXO 上。如果 Bob 想要将 TEST 代币转给其他人，那么绑定的比特币 UTXO 也必须转移。这样，携带 RGB++ 资产数据的 Cell 与比特币 UTXO 之间就存在 1 对 1 的绑定关系。只要比特币 UTXO 没有被双花，绑定的 RGB++ 资产就不能被双花。通过这种机制，RGB++ 资产就继承了比特币的安全性。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-2va32i6.jpeg?auto=format&fit=max&w=3840)

RGB++ Layer是RGB++协议工程化实现的产物，其两大主要特性为同构绑定和Leap免桥跨链。

## 2.同构绑定与飞跃——BTCFi 的资产发行与无桥跨链层

要理解同构绑定和 Leap 方法，解释 CKB 的 Cell 模型是必不可少的。Cell 是一个扩展的 UTXO，具有 LockScript、TypeScript 和 Data 等多个字段。LockScript 的功能类似于比特币的锁定脚本，用于权限验证；TypeScript 类似于智能合约代码，而 Data 用于存储资产数据。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-beb320m.jpeg?auto=format&fit=max&w=640)

如果要在 CKB 链上发行 RGB++ 资产，则需要先创建一个 Cell，并在相关字段中写入 token 符号和合约代码。然后可以将 Cell 拆分并分发给许多人，就像比特币 UTXO 的拆分和转移一样。

由于 Cell 结构上与比特币 UTXO 相似，CKB 与比特币签名算法相似，用户可以使用比特币钱包操作 CKB 链上的资产。作为 Cell 的所有者，你可以设置其锁定脚本，使其解锁条件与比特币 UTXO 一致，从而允许你使用比特币账户的私钥直接操作 CKB 链上的 Cell。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-hxc32xn.jpeg?auto=format&fit=max&w=3840)

上述功能也可以在 CKB、BTC 和其他 UTXO 公链之间实现。例如，你可以使用 Cardano 账户改写 CKB 链上的资产数据，RGB++ 资产的控制权无需跨链转接，就可以从 BTC 账户转移到 Cardano 账户。请记住，比特币、Cardano、Liquid 等公链上将 RGB++ 资产与 UTXO 绑定（类似于现实生活中银行账户与客户的电话号码和 ID 绑定）是为了防止双花。

还需要注意的是，RGB++资产是一堆需要像数据库一样介质存储的数据。CKB链上的Cells可以作为它们的数据库。然后可以设置权限验证，允许来自BTC、Cardano等不同公链的账户访问CKB链上的RGB++资产数据。

RGB++ Layer 提出的“Leap”和无桥跨链，是基于同构绑定技术，其目的就是将绑定在 RGB++ 资产上的 UTXO 进行“重新绑定”。比如，如果你的资产之前绑定在比特币的 UTXO 上，那么现在可以重新绑定到 Cardano、Liquid、Fuel 等链上的 UTXO 上，从而将资产控制权限从 BTC 账户转移到 Cardano 或其他账户上。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-9zd32xf.jpeg?auto=format&fit=max&w=3840)

从用户角度看，这相当于资产跨链，CKB 扮演着类似于索引器和数据库的角色。不过与传统跨链方式不同，“Leap”只是改变了修改资产数据的权限，而数据本身仍然存储在 CKB 链上。这种方式比 Lock-Mint 模型更加简洁，并且消除了对映射资产合约的依赖。

## 同构绑定的技术实现方式

假设Alice拥有100个TEST币，其数据存储在Cell#0中，与比特币链上的UTXO#0存在绑定关系。为了向Bob转出40个TEST币，她需要将Cell#0拆分成两个新的Cell，其中Cell#1包含需要转给Bob的40个TEST币，Cell#2包含仍由Alice控制的60个TEST币。

在这个过程中，绑定在 Cell#0 上的 BTC UTXO#0 需要拆分成 UTXO#1 和 UTXO#2，然后分别绑定到 Cell#1 和 Cell#2 上。这样当 Alice 将 Cell#1 转给 Bob 时，她也可以将 BTC UTXO#1 转给 Bob，一键完成，实现 CKB 和 BTC 链上的同步交易。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-w5e32hr.jpeg?auto=format&fit=max&w=1920)

同构绑定的核心意义在于它的适应性。这一点尤其重要，因为 CKB 的 Cell、Cardano 的 eUTXO 和比特币的 UTXO 都是 UTXO 模型，而 CKB 兼容比特币/卡尔达诺的签名算法。比特币和卡尔达诺链上 UTXO 的操作方式，同样适用于 CKB 链上的 Cell。这样，比特币/卡尔达诺账户就可以直接同时控制 CKB 链上的 RGB++ 资产和其绑定的比特币/卡尔达诺 UTXO，实现 1:1 同步交易。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-pff325a.jpeg?auto=format&fit=max&w=3840)

按照上面 Alice 向 Bob 转账的场景，一般工作流程如下：

1.  Alice 在本地（尚未上链）构造一个 CKB 交易数据，指定 Cell#0 将被销毁、生成要发送给 Bob 的 Cell#1、自己保留 Cell#2；
    
2.  Alice 在本地生成声明，将 Cell#1 绑定到 UTXO#1，将 Cell#2 绑定到 UTXO#2，并将 Cell#1 和 UTXO#1 都发送给 Bob；
    
3.  然后，Alice 在本地生成一个 Commitment（类似于哈希），对应的原始内容包括步骤 2 中的声明 + 步骤 1 中生成的 CKB 交易数据；
    
4.  Alice 在比特币链上发起一笔交易，销毁 UTXO#0，生成 UTXO#1 发送给 Bob，UTXO#2 留给自己，并将 Commitment 以 OP\_Return 操作码的形式写入比特币链；
    
5.  步骤4完成后，步骤1中生成的CKB交易被发送到CKB链上。
    

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-2rg321d.jpeg?auto=format&fit=max&w=1920)

需要注意的是，Cell 和对应的比特币 UTXO 是同构绑定的，可以直接被比特币账户控制。也就是说，在交互过程中，用户可以通过 RGB++ 钱包中的比特币账户进行一键操作。因此，绑定在比特币 UTXO 上的 RGB++ 资产有助于解决双花问题，因为 RGB++ Layer 上的资产继承了比特币的安全性。

上述场景不仅限于比特币和 CKB 之间的同构绑定，还适用于包括 Cardano、Liquid、Litecoin 等广泛的链。

## Leap 的实现原理及支持场景

Leap 的功能其实就是切换绑定 RGB++ 资产的 UTXO，比如将绑定从比特币切换到 Cardano，之后你就可以通过 Cardano 账户控制 RGB++ 资产了。这样之后还可以在 Cardano 链上进行转账，将控制 RGB++ 资产的 UTXO 拆分转移给更多人。RGB++ 资产可以在多个 UTXO 公链上转移和分发，同时可以绕过传统的跨链桥 Lock-Mint 模型。

在这个过程中，CKB 公链扮演着类似索引器的角色，见证和处理 Leap 的请求。假设你想把绑定在 BTC 上的 RGB++ 资产转到 Cardano 账户，核心步骤如下：

1.  在比特币链上发布承诺 (Commitment)，宣告解除与 BTC UTXO 绑定的 Cell；
    
2.  在 Cardano 链上发布承诺，声明将 Cell 与 Cardano UTXO 绑定；
    
3.  更改 Cell 的锁定脚本，将解锁条件由比特币账户私钥改为 Cardano 账户私钥
    

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-qfh32n7.jpeg?auto=format&fit=max&w=1920)

需要注意的是，整个过程中RGB++资产数据还是存储在CKB链上的，解锁条件由比特币私钥变为了Cardano私钥，当然具体的执行过程比上面描述的要复杂很多，这里就不细说了。

在向非 CKB 公链的跨越中，隐含的前提是 CKB 公链充当了第三方见证人、索引器和 DA 工具的角色。这是因为作为一条公链，它的可信度远远超过了传统的多方计算 (MPC)、多重签名等跨链桥接方式。

基于 Leap 函数可以实现的另一个有趣的场景是“全链交易”。这种场景的一个例子是，在比特币、Cardano 和 CKB 之间建立一个索引器，以构建一个允许买家和卖家交易 RGB++ 资产的交易平台。在这种情况下，买家可以将他们的比特币转给卖家，并通过他们的 Cardano 账户接收 RGB++ 资产。

在整个过程中，RGB++资产的数据仍然记录在Cells中，并转移给买家，其解锁权限从卖家的比特币私钥变为买家的Cardano私钥。

## 包装器

虽然 Leap 功能对于 RGB++ 资源来说已经非常完美，但仍然存在一些瓶颈：

对于比特币和 Cardano 来说，RGB++ 资产本质上是基于 OP\_RETURN 操作码的铭文/符文/彩色币。这些公链的节点无法感知 RGB++ 资产的存在，CKB 只是作为索引器参与协调。也就是说，对于比特币和 Cardano 来说，RGB++ Layer 主要支撑的是铭文/符文/彩色币的跨链，而非像 BTC、ADA 这样的原生资产的跨链。

为了解决这个问题，RGB++ 层引入了 Wrapper，这是一种基于欺诈证明和超额抵押的桥梁。以 rBTC 包装器为例，它将 BTC 桥接到 RGB++ 层。在 RGB++ 层上运行的一组智能合约监视着桥梁的守护者。如果守护者行为恶意，他们的抵押品将被削减。如果他们合谋窃取锁定的 BTC，rBTC 持有者将获得全额赔偿。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-o9i32fp.jpeg?auto=format&fit=max&w=3840)

通过Leap与Wrapper的结合，BTCFi生态中的各种资产，例如RGB++原生资产、BRC20、ARC20、符文等，都可以桥接到其他层或公链。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-zoj32oe.png?auto=format&fit=max&w=3840)

下图是LeapX的部分使用流程，支持几乎所有主流BTCFi资产与不同生态的互操作，对于不同发行方式的资产，有的采用wrappers，有的采用Leap，都有相应的处理流程。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-ybk32ov.jpeg?auto=format&fit=max&w=3840)

## 3\. CKB-VM：BTCFi 的智能合约引擎

由于传统BTCFi缺乏对智能合约的支持，在不断发展的空间中只能实现相对简单的去中心化应用程序（dApp），有些实现方式可能存在一定的中心化风险，有些实现方式则比较笨拙或不灵活。

为了实现区块链可用的智能合约层，CKB 通过 RGB++ 层引入了 CKB-VM，旨在让任何支持 RISC-V 虚拟机的编程语言都可以在 RGB++ 层上进行合约开发，让开发者能够在统一的智能合约框架和执行环境下，使用自己喜欢的工具和语言开发和部署高效、安全的智能合约。

总体来说，由于 RISC-V 具有广泛的语言和编译器支持，开发者使用 RISC-V 进行智能合约开发的入门要求相对较低。当然，语言只是编程的一个方面，学习特定的智能合约框架也是不可避免的。但是，有了 RGB++ Layer，就可以用 JavaScript、Rust、Go、Java 和 Ruby 轻松重写逻辑，而不必学习特定的 DSL 语言来编写合约。

下图是使用 C 语言实现 CKB 转账用户自定义 token（UDT）的方法，除了语言不同，其基本逻辑和通用 token 是一样的。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-fyl32qa.png?auto=format&fit=max&w=3840)

## 4\. 原生AA生态：无缝连接BTC与RGB++

最后，由于BTCFi本质上是为原生比特币资产提供多样化的DeFi体验，因此了解RGB++ Layer背后的账户抽象生态系统以及其主流比特币钱包是BTCFi外围设施需要考虑的重要因素。

RGB++ Layer 直接复用了 CKB 原生的 AA 方案，在开发者端和用户端都兼容 BTC、Cardano 等主流 UTXO 公链。通过 RGB++ Layer，可以使用不同的签名算法进行认证，即用户可以使用 BTC、Cardano 甚至 WebAuthn 的账户、钱包或认证方式，直接在 RGB++ Layer 上操作资产。

以钱包中间件 CCC 为例，它可以为钱包和 dApp 提供对 CKB 的各条公链的可操作性。下图是 CCC 的连接窗口，以及它如何支持 Unisat、Metamask 等主流钱包入口。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-gem32sc.jpeg?auto=format&fit=max&w=3840)

再比如，CKB 生态钱包 JoyID 就是 WebAuthn 的实现，JoyID 用户可以通过生物识别方式（如指纹或者人脸识别）直接认证账户，实现无缝且高度安全的登录和身份管理。

![](https://hackernoon.imgix.net/images/InxBRjRIs6M1kdhuWcyNHiiUrxm1-vvn32cy.jpeg?auto=format&fit=max&w=3840)

可以说RGB++ Layer拥有完整的原生AA方案，同时也可以容纳其他公链的账户标准，这一特性不仅方便了部分关键场景的支持，也为UX扫清了障碍。

## 概括

本文主要介绍了RGB++ Layer的核心技术，没有讲解其中几个复杂的细节。

重点强调了RGB++ Layer可以成为实现包括各类meme币、铭文/符文/彩色币等全链交互场景的重要基础设施，该层基于RISC-V的智能合约执行环境也可以为BTCFi成长所需的复杂业务逻辑创造土壤。

随着RGB++ Layer的不断推进，后续还会对项目相关的一系列技术方案进行更加深入的解析，敬请期待！