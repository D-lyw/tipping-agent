# The Nervos Network 定位白皮书

| Number | Category | Status | Author | Organization | Created |
| --- | --- | --- | --- | --- | --- |
| 0001 | Informational | Draft | The Nervos Team | Nervos Foundation | 2019-09-12 |

## The Nervos Network 定位白皮书

## 1.目的

Nervos Network 由一系列协议和创新方法组成。关键协议的设计和实现需要有明确的文档和技术规范，这一点至关重要，因此我们采用 RFC (request for comment) 流程。然而同样重要的是，我们希望帮助社区了解我们要完成的工作，所做的权衡以及如何达成目前设计的决策。

本文首先详细研究了目前公有链（Public Permissionless Blockchain）面临的问题，以及试图解决这些问题的现有解决方案。我们希望能够为读者提供必要的背景信息，以便大家了解我们如何尽全力应对这些挑战，以及我们做这些底层设计决策的理由。之后，本文提供了对 Nervos Network 各个组成部分的详细描述，并重点介绍每个部分是如何协同工作以支持我们对整个网络的愿景。

## 2\. 背景

可扩展性、可持续性和互操作性是当今公有链面临的最大挑战。虽然许多项目声称能够解决这些问题，但重要的是我们需要了解问题的根源，并将在可能的权衡取舍背景下给出解决方案。

### 2.1 可扩展性

比特币\[1\]作为第一个公有链，旨在成为点对点的电子现金。以太坊\[2\]创建了一个通用的去中心化计算平台，使更多场景成为可能。然而，两个平台都对交易能力施加了一些限制——比特币限制了区块大小，以太坊限制了区块 Gas 上限。这些是确保平台长期去中心化的必要措施，但也限制了平台的交易能力。

区块链社区近年来提出了许多可扩展性方案。通常，这些解决方案可以分为两类：链上扩容和链下扩容。

链上扩容方案的目标是扩大共识过程的吞吐量，建立拥有与中心化系统吞吐量相媲美的区块链系统。链下扩容方案将区块链作为一个安全的资产存储和结算平台，同时将几乎所有的交易转移到上层。

#### 2.1.1 单一区块链的链上扩容

提高区块链吞吐量最直接的方法是区块扩容。有了更大的区块容量，网络就能够处理更多的交易。增加区块容量的供应，可以满足不断增长的交易需求，这也能够让交易费用保持在较低水平。

比特币现金（BCH）就是采用这种方法来提高其点对点支付网络的可扩展性。最初，比特币现金协议的最大区块大小为 8MB，后来增加到 32MB，随着交易需求的增加，它的区块大小也将继续无限扩大。相比之下，比特币（BTC）在 2017 年 8 月实现隔离见证后，目前协议能容纳的平均区块大小约为 2MB。

从数据的角度来看，我们可以做一个简单的算术题：如果全球 75 亿人每天创建 2 笔链上交易，那么该网络每 10 分钟就会产生 26GB 的区块数据，所以区块链数据的增长速度就为每天 3.75TB 或每年 1.37PB\[3\]。这些存储和带宽的需求，对于现今的任何云服务来说都是合理的。

但是，如果我们仅从数据理论上考虑节点的运营，那么可能会导致只有单个可行的网络拓扑，这会损害网络的安全性（区块链的分叉率将随着网络上数据传输的需求增加而增加）以及去中心化的程度（全节点数将随着参与共识的成本增加而减少）。

从经济学的角度来看，不断扩大的区块容量确实会减轻用户的费用压力。对比特币网络的分析显示，在比特币区块容量占用率达到大约 80% 之前，比特币手续费基本保持不变，一旦超过 80%，手续费将以指数形式上涨\[4\]。

让运营商来承担不断增长的网络成本，似乎非常合理，但实际上却是饮鸩止渴：

+   如果我们抑制系统的交易费用，那么新发行的代币（也就是出块奖励）将会被迫成为矿工的主要收益来源；
    
+   除非协议有通货膨胀的机制，否则（当达到总量硬顶）新的代币发行最终停止时，矿工将既不会获得出块奖励，也不会得到足够高的交易手续费。这带来的经济影响会严重的损害网络的安全模型；
    
+   运行全节点的成本变得极其昂贵。这会让普通用户没有独立验证区块链历史和交易的能力，从而只能依赖交易所和支付处理商等服务提供方来保证区块链的完整性。这和公链作为点对点 、去中心化的分布式系统的核心价值主张（Value Proposition）相违背。
    

比特币现金等致力于优化交易成本的平台面临着来自其他（许可和非许可）区块链以及传统支付系统强有力的竞争。如果一个平台需要提高安全性或抗审查能力，那么就会产生相关的成本，同时也会增加使用该平台的成本。考虑到目前的竞争环境，以及网络的既定目标，降低成本很可能是网络的首要目标，甚至可以牺牲其他任何考虑因素。

我们对交易网络的使用情况进行了观察，发现它们的目标统样是降低成本。这些系统的用户并不关心网络是否有基于长期的重要权衡，因为他们只是网络短期的使用者。一旦他们得到了产品或服务，并且完成支付结算，这些用户就不再关心网络是否能继续有效运行。在广泛使用的中心化加密资产交易所和相对中心化的区块链中，它们普遍都接受了这样的折中方案。这些系统主要因为它们的便捷性和交易效率而广受欢迎。

一些智能合约平台采用了类似的方法来扩展区块链的吞吐量，它们只通过有限的一组「超级计算机」作为验证工具，参与共识过程并独立验证区块链。

虽然，平台可以通过在去中心化和网络安全方面做一些妥协，以获得更低的交易成本，这可能对某类用户来说会更加方便，但是这样一来，就会破坏平台的长期安全模型，增加独立验证交易的成本门槛，增加节点运营商的中心化倾向和代沟，这些隐患让我们确信，单一区块链的链上扩容不是扩展公有链的正确方法。

#### 2.1.2 基于多链的链上扩容

基于多链实现链上扩容的方案，包括以太坊 2.0 的分片和 Polkadot 中的应用链等。这些设计有效地将全局状态和网络中的交易划分成多链，允许每条链快速达成本地共识，之后整个网络通过「信标链」（Beacon Chain）或「中继链」（Relay Chain）的共识达成全局共识。

这类设计允许多条链使用共享的安全模型，同时可以在分片（以太坊）或应用链（Polkadot）上实现高吞吐量和快速交易。尽管每个系统都是由相互连接的区块链组成的网络，但它们在每条链上运行的协议都存在一些差异。在以太坊 2.0 中，每个分片都运行相同的协议，而在 Polkadot 中，每个区块链都可以运行通过 Substrate 框架创建的自定义协议。

在这些多链架构中，每个 dApp （或 dApp 的实例）运行在单一的链上。尽管目前开发者已经习惯构建与链上的任何其他 dApp 无缝交互的 dApp，但是它们的设计模式仍需要适应新的多链架构。如果一个 dApp 需要跨多个分片，那么就需要设计一些机制来保持状态在不同的 dApp 实例（部署在不同的分片）之间得到同步。此外，虽然 Layer 2 机制能够实现快速跨分片通信，但是跨分片交易需要全局共识，并会带来确认延迟的问题。

在异步交易中臭名昭著的「火车和酒店」问题就出现了，当两个交易必须是原子性时（例如，在两个不同的分片上预订火车票和酒店房间），就需要新的解决方案。以太坊引入合约「yanking」，在一个分片上删除依赖合约，在第二个分片上创建合约（包含另一个依赖合约），然后在第二个分片上执行这两个交易。然而，在原始分片上无法获得「yanked」合约，这又引入了可用性的问题并且需要新的设计模式。

分片有着自己的优势和挑战。如果分片可以实现真正地独立，并且实现跨分片的需求最低，那么区块链就可以通过增加分片的数量来线性提升其吞吐量。这种方案最适合独立、不需要外部状态或与其他应用程序协作的应用程序。

如果将分片架构应用在那些，将应用程序组件组合在一起而开发的应用程序上，那么就可能会出现问题（称为「可组合性问题」）。可组合性与去中心化金融（DeFi）领域尤为相关，因为在那里，更优越的产品往往建立在其他底层产品组件之上。

更技术性的来说，分片通常需要「1 + N」拓扑，N 条链与一条主链连接，同时引入了主链支持分片数量的上限，以确保在这个上限范围内不会出现可扩展性问题。

我们观察到统一的全局状态具有重要的价值，可以促进因应用程序的相互依赖而出现的生态系统发展，开发者在边缘进行创新，类似于 Web 开发者使用库来处理底层的问题，以及使用开放的 API 实现服务集成。当开发者不必考虑同步性（跨分片资产转移或消息传递）时，他们的开发会更加方便，并且当区块链交互的体系结构保持一致时，系统可以实现更卓越的用户体验。

我们认为分片是具有前景的扩容方案（特别是对于相对独立的应用程序来说），但是我们相信，将最有价值的状态集中在单个的区块链上的设计是更加有益的，它能够实现可组合性。链下扩容方案就采用了这种设计，实现了更高的吞吐量。

#### 2.1.3 基于 Layer 2 的链下扩容

在 Layer 2 协议中，底层区块链作为结算（或提交）层，向上层网络路由密码学证明，允许参与者「接收」加密货币。上层网络的所有活动都由底层区块链进行加密安全保证，底层仅用于结算上层网络金额的进入/退出，以及解决争议。这样的设计可以让资金在没有授权托管（或损失风险）的情况下进行，并且可以实现即时、几乎免费的交易。

通过这些技术，像比特币这样的价值存储网络也可以用于日常支付。最经典的 Layer 2 实用案例就是在顾客和咖啡店之间建立的支付通道。假设 Alice 每天早上都会去比特币咖啡店，月初，她把资金存入与咖啡店共同启用的闪电支付通道中（比特币网络的支付通道技术），当她每天到店时，咖啡店可以通过 Alice 的加密签名授权来获取一些担保资金，这样 Alice 就可以换取她的咖啡。这些交易是即时发生、完全点对点和「链下」的，可以提供流畅的用户体验。闪电通道是去信任的，Alice 或咖啡店可以随时关闭通道，拿走在关闭时刻属于他们的资金。

类似闪电通道这样的支付通道只是链下扩容方案中的一种例子，还有很多成熟的技术能够通过这种方式，安全地扩展区块链吞吐量。支付通道包括双方对链下通道余额的共识，状态通道包括通道参与者之间对任意状态的链下共识。状态通道的实现，为可扩展的、去信任的去中心化应用程序的提供了基础。一个状态通道甚至可以被多个应用程序使用，这样会有更高的效率。当一方准备退出通道时，他们可以将协商好的加密证明提交给区块链，区块链将执行合约事先约定的状态转换。

侧链是另一种可增加吞吐量的结构，不过是通过可信的第三方区块链运营商实现的。通过双向锚定一个可靠的、去信任化共识的区块链，可以实现让资产在主链和侧链之间来回流动。这样就可以在侧链上进行大量可信的交易，随后在主链上进行净额结算。侧链交易具有交易费低，确认快和吞吐量高的特性。虽然侧链在某些方面为用户提供了优越的体验，但确实也会在安全性上有所妥协。目前人们对于去信任的侧链有大量的研究，在未来，希望它可以在不损害安全性的情况下，提供相同的性能改进。

去信任侧链技术的一个例子是 Plasma（会在 5.4 中提到），它利用了区块链上的信任根，是具有广泛的全球共识的一种侧链架构。Plasma 链能够拥有与中心化的侧链一致的性能提升，同时保证了安全性。如果 Plasma 链运营商作恶或出现故障，用户可以安全地将侧链资产撤回到主链。撤回资产的操作不需 Plasma 运营商的配合，这样一来，可以为用户提供侧链交易的便利性，同时能够得到 Layer 1 区块链的安全保证。

利用链下扩容技术能够兼顾去中心化、安全性和可扩展性。通过将除了结算交易和解决纠纷以外的所有业务都转移到链下，有效利用公有链有限的全局共识。可根据应用程序需求实现不同的 Layer 2 协议，为开发人员和用户提供灵活性。随着更多的参与者加入到网络中，性能不会受到影响，所有参与方都可以共享 Layer 1 共识提供的安全保证。

### 2.2 可持续性

长期维持一个自治的、无所有者的公有链的运营是一个相当大的挑战。激励机制必须在不同的利益相关者之间达成平衡，系统的设计必须考虑到广泛的全节点运营和公开的可验证性。在支持开放的全球网络时，对于全节点的硬件要求必须保证合理。

区块链原生资产的激励和控制必须能够平衡长期持有者的升值需求，以及保护网络的矿工或验证者的补偿需求。

此外，一旦公有链开始运行，就很难改变治理协议的基本规则。因此从一开始，系统就必须设计成可持续的。为此，我们对建立可持续公有链所面临的挑战进行了彻底的研究。

#### 2.2.1 去中心化

公有链面临的最大长期威胁之一，是独立参与和交易验证之间出现了越来越多的障碍，这会反映在运行全节点的成本上。全节点可使区块链参与者独立验证链上状态/历史记录，并通过拒绝无效区块来让网络的矿工或验证者承担责任。由于全节点的运行成本增加，从而节点数量减少，网络的参与者被迫需要依赖专业运营商来提供历史记录和当前状态，这会破坏开放和无需许可区块链的基础信任模型。

全节点要想跟上区块链的发展，必须具有足够的计算吞吐量来验证交易，足够的带宽吞吐量来接收交易，以及足够的存储容量来存储整个全局状态。为了控制全节点的运营成本，协议必须采取措施来限制这三种资源的吞吐量或容量增长。大多数区块链协议限制了计算或带宽吞吐量，但很少限制全局状态的增长。随着区块链不断运行，链的大小和长度增加，全节点运营成本也将不可逆转地增加。

#### 2.2.2 经济模型

近年来对共识协议进行了大量研究，然而我们认为目前在加密经济领域研究不足。大体上说，现在 Layer 1 的加密经济模型主要集中在经济激励和惩罚以确保网络共识，而原生代币主要用于支付交易费或满足抗女巫攻击的抵押需求。

我们认为，精心设计的经济模型应该超越共识过程，并确保协议的长期可持续性。特别是经济模型的设计应实现以下目标：

+   该网络应拥有一种可持续的方式来增加收入来补偿服务提供商（通常是矿工或验证者），以确保网络维持长期的安全性；
    
+   该网络应拥有一种可持续的方式来保持较低的全节点参与壁垒，以确保网络随着时间的推移仍然保持去中心化；
    
+   公共网络的资源应该得到有效和公平的分配；
    
+   区块链的原生代币必须具有令人信服的内在价值。
    

#### 2.2.3 比特币的经济模型分析

比特币协议限制了区块的大小并强制执行固定的区块时间。这使得网络的带宽吞吐量成为用户必须通过手续费竞标的稀缺资源。比特币脚本不允许循环，使脚本的长度很接近其计算复杂度。通常若需要更大的区块空间，则用户需支付更高的交易费。交易中涉及的输入，输出或计算步骤越多，用户支付的交易费就越多。

比特币的内在价值几乎全部来源于它的货币溢价（人们将其视为金钱的意愿），特别将其作为一种价值储存的意愿。由于矿工收入以比特币计价，因此这种观点必须要求比特币的经济模式具有可持续性。换句话说，比特币的安全模型是循环的——它依赖于人们的集体信念，即相信它是可持续安全的，因此可以成为货币型的价值存储。

比特币的区块大小上限有效设置了网络参与的限制——区块大小上限越低，就越利于非专业人士运行全节点。比特币的全局状态是其 UTXO 集，其增长率也受到区块大小限制的限制。比特币鼓励用户创建和使用 UTXO；创建更多 UTXO 也意味着更高的交易费。然而，比特币协议没有提供激励措施来鼓励组合 UTXO 以减小全局状态；一旦一个 UTXO 被创建，它将在被花费掉之前免费占用全局状态。

比特币的基于交易费的经济模型是用于分配其带宽吞吐量的公平的模型，因为带宽是协议规定的稀缺资源。对于点对点支付系统来说这是一个很好的经济模型，但对于真正的价值存储平台来说，这个选择很糟糕。比特币用户只需支付一次交易费用就能够在区块链上存储价值，可以永久拥有状态，并享受矿工需持续投入资源才能提供的持续的安全保证。

比特币具有总供应量硬顶，通过区块奖励的发行量最终将降至零。这会引发两个问题：

第一，如果比特币继续成功地作为价值存储，每个比特币的价值将持续提升，网络保护的总价值也将持续提升（更多的货币价值涌入比特币网络）。价值存储平台必须在它所保护的价值提高的同时，能够提升其安全预算，否则，攻击者会进行双花攻击以窃取资产。

当攻击协议的成本低于诚实行事所能获得的利益时，攻击者总是会进行攻击。类似一个城市，随着城市内部财富的增加，必须提高军费开支。如果没有对军事的投资，这座城市迟早会遭到袭击和洗劫。

通过区块奖励比特币能够根据其存储的总价值来衡量安全性 - 如果比特币的价格翻倍，矿工从区块奖励中获得的收入也将增加一倍，因此他们能够提供两倍的算力，从而使网络攻击的成本提高一倍。

然而，当可预测的区块奖励降至零时，矿工将不得不完全依赖交易费用，他们的收入将不再与比特币资产的价值挂钩，而是由网络的交易需求决定。例如，如果交易需求不能填满区块空间，那么总交易费用将非常小。由于交易费严格来说是对区块空间需求的相关函数，独立于比特币的价格，这会对比特币的安全模型产生深远影响。可以说，比特币的价格也会受到一致的、超过容纳能力的交易需求的影响。为了让比特币网络维持安全性，我们就必须假设有持续的、超过区块容量的交易需求，这也和比特币的价格相挂钩。这些都是非常强的前提假设。

第二，当可预测的区块奖励终止时，矿工收入将完全依赖于交易费。这将导致矿工每个区块收入的巨大差异，矿工会有更强的动机分叉，而不是推进区块链。极端情况下，当一个矿工的交易内存池是空的，而且接收了包含交易费的区块，他们的动机是分叉区块链，窃取交易费，而不是推进和生成可能没有收入的区块\[5\]。这在比特币社区被称为「费用狙击（Fee Sniping）」挑战，在不去掉比特币的硬顶的情况下，还没有找到令人满意的解决方案。

#### 2.2.4 智能合约平台的经济模型分析

典型智能合约平台的经济模型面临更多挑战。以以太坊为例，以太坊脚本允许循环，因此其脚本的长度不反映其计算复杂度。这就是为什么以太坊不限制区块大小或带宽吞吐量，而是用区块 Gas 限制来表示计算吞吐量。

为了让他们的交易记录在以太坊区块链上，用户按他们愿意支付的单位计算成本出价。以太坊使用 Gas 的概念作为 ETH 中计算成本的度量，以确保每个计算步骤的成本可以独立于其原生代币的价格波动。ETH 代币作为去中心化计算平台的支付代币，其内在价值来自于它是唯一可以用于支付以太坊计算成本的货币。

以太坊的全局状态用 EVM 的状态树表示，数据结构包括所有账户的余额和内部状态。当创建了新账户或合约值时会增加全局状态。以太坊对在其状态存储中插入新值收取固定数量的 Gas 费用，并在删除值时提供固定数量的 Gas 作为交易退款。

这种「一次性付费，永久占用」的存储模型与矿工和全节点持续的成本结构不匹配，也没有鼓励用户主动或提早删除状态。因此，以太坊经历了其状态规模的迅速增长。状态越大会越降低交易处理速度，并增加全节点的运营成本。如果没有强而有力的动机来清除状态，这一趋势必然会继续下去。

与比特币类似，以太坊以需求驱动 Gas定价是分配其计算吞吐量的一个公平的模型，计算吞吐量是平台的稀缺资源。这个模型也符合以太坊作为去中心化计算系统的目标。然而，这样的状态存储费用模型，并不能支撑起以太坊成为一个有潜力的去中心化状态或资产存储平台。如果没有一个长期状态存储的成本，那么用户会更想永久免费占用；如果状态存容量不具备稀缺性，那么就既不能建立起市场，也不能因此建立供需动态。

与比特币不同，比特币在其核心协议中指定了区块大小限制，以太坊允许矿工在生产区块时动态调整区块 Gas 限制。拥有先进硬件设备和带宽的矿工能够生产更多的区块，有效地主导了投票过程。他们更愿意上调区块 Gas 限制，提高参与门槛，迫使规模较小的矿工退出竞争。这是导致全节点运营成本快速上升的另一个因素。

像以太坊这样的智能合约平台是多资产平台。他们支持所有类型的加密资产的发行和交易，通常用「代币（Token）」表示。它们不仅为自己的原生代币提供安全保证，还为平台上所有加密资产的价值提供安全保证。因此，在多资产的语境下，「价值储存（Store of Value）」指的是一种对于平台的原生代币和平台上存储的加密资产都有利的价值存储属性。

通过区块奖励，比特币拥有优秀的价值存储经济模型。矿工获得以比特币计价的固定区块收入，且收入随着比特币的价格上涨而上涨。因此，该平台能够在维持可持续经济模型的同时，为矿工增加收入，以提高安全性（以攻击成本衡量）。

对于多资产平台来说，实现这一需求变得更具挑战性，因为「价值」可以用加密资产来表示，而不仅限于原生代币。如果平台所保护的加密资产价值增加了，但是原生代币的价值没有增加，那么网络的安全性就不会增加。攻击平台的共识形成的过程，来对平台上存储的加密资产进行双花，就会变得更加有利可图。

要使多资产智能合约平台发挥价值存储功能，对拥有链上资产的需求必须有一个明确的方法来产生对其原生代币所有权的需求。或者换句话说，平台的原生代币必须能够很好的捕获平台价值。如果平台原生代币的内在价值仅限用于支付交易费用，那么它的价值将完全由交易需求决定，且不会反应在对于平台上存储的加密资产所有权的需求上。

没有为价值存储而设计的智能合约平台，必须依赖原生代币的货币溢价（人们持有代币的意愿超出其内在价值）来提供持续的安全保证。只有当一个平台能够以无可替代的特性占据主导地位，或者通过提供尽可能低的交易成本来超越其他平台时，这样才是可行的。

以太坊目前享有这样的优势，因此可以保持其货币溢价。然而，随着其他追求更高 TPS 并且提供类似功能的竞争平台的兴起，仅依靠货币溢价是否能够维持区块链平台的安全性还有待商榷，尤其是在原生代币没有被明确的设计为或者被认为是货币时。而且，即使一个平台可以提供独一无二的功能，也可以通过高效的交换将货币溢价从用户的交互中抽离出来（很有可能是区块链应用大规模落地时代来临的时候）。用户可以持有他们最熟悉的资产，如比特币或稳定币，只有在需要支付平台交易费用时获取平台原生代币即可。无论在上述哪种情况下，平台的加密经济学基础都会崩溃。

Layer 1 多资产平台必须为保护的所有加密资产提供可持续的安全性。换句话说，他们必须有一个为价值存储而设计的经济模型。

#### 2.2.5 核心协议开发资金

公有链是公共的基础设施。这些系统的初始开发需要大量资金投入，一旦投入使用，就需要不断的维护和升级。如果这些系统没有专门负责维护的人员，那么将会面临灾难性漏洞和操作不当的风险。比特币和以太坊协议并没有提供一种原生机制来为正在进行的开发提供资金，而是依赖于具有共同兴趣的无私开源社区的持续参与。

Dash 是第一个在协议中利用财政部来资助正在进行的开发项目。然而，在持续地支持协议开发的同时，这种设计在加密货币价值的可持续性方面也做出了让步。和大多数区块链财政部一样，这种模型依赖于基于通胀的融资，这会侵蚀长期持有者手中资产的价值。

Nervos Network 采用财政部模型来为核心开发提供持续的资金。财政部资金来自于对短期代币持有者的目标通胀，同时协议的设计也能减轻这类通胀对长期持有人的影响。关于这种机制的更多信息在（4.6）中描述。

### 2.3 互操作性

跨区块链的互操作性是人们经常讨论的话题，许多项目都专门针对这一挑战提出过解决方案。通过可靠的跨链交易，能够在去中心化经济中实现真正的网络效应。

区块链互操作性的第一个例子是比特币和莱特币之间的原子交换。比特币与莱特币之间的去信任交互不是通过协议内的机制实现的，而是通过共享的加密标准（特别是使用了 SHA2-256 哈希函数）实现的。

类似地，以太坊 2.0 的设计能够实现多个分片链的互连，所有分片链都运行相同的协议，并使用相同的密码学原语。在为分片间通信定制协议时，这种一致性很有价值，但是以太坊 2.0 将无法与使用了其他密码学原语的区块链实现互操作。

诸如 Polkadot 或 Cosmos 之类的区块链网络则更进一步，允许使用相同的框架（如 Cosmos 的 Cosmos SDK 和 Polkadot 的 Substrate）构建的不同区块链相互通信和交互。开发者可以更加灵活地构建自己的协议，并确保了相同密码学原语的可用性，允许每个链能够解析另一个链并交叉验证交易。然而，它们都依赖于中继或「锚定区域」（Pegging Zones）来和没有用自己的框架构建的区块链进行连接，从而需要引入额外的信任层。值得一提的是：尽管 Cosmos 和 Polkadot 的目标都是实现「区块链网络」，但 Cosmos 和 Polkadot 网络并没有为彼此互操作而设计。

跨链网络的加密经济学也需要进一步的研究。Cosmos 和 Polkadot 的原生代币都可以被用来进行 Staking、治理和用作交易费。Staking 无法单独给出原生代币的内在价值（在 4.2.4 中会讨论到），抛开通过 Staking 而引入的加密经济动力不说，依赖于跨链交易而获取生态系统价值的模型是很脆弱的。而且，跨链交易是多链网络的弱点，而非优势，就像跨分片（Cross-shard）交易是分片数据库的弱点一样。跨链交易带来了延迟，也会导致原子性（Atomicity）和可组合性（Composability）的缺失。为了减少跨链的开销，在不同链上需要交互的应用最终会趋向于迁移到相同的区块链上，减少对跨链交易的需求，从而减少对原生代币的需求。

跨链网络可以从网络效应中获益——网络中相互连接的链越多，网络的价值就越大，对网络中潜在新参与者的吸引力也越大。理想情况下，我们希望看到这个价值能够逐渐地被捕获到原生代币中去，以进一步促进网络的增长。然而，在像 Polkadot 这样集中的安全网络中，更高的原生代币价格会提高参与成本，成为网络进一步增值的障碍。在像 Cosmos 这样松散性连接的网络中，更高的代币价格会提高赚取跨链交易费用的资金成本，这降低了质押资本的预期回报，进而会阻碍用户参与进一步的质押。

采用分层架构的 Nervos Network 也是一个多链网络。从架构上来说，Nervos 使用 Cell 模型和底层虚拟机来支持真正的自定义和用户创建的密码学原语，以支持异构区块链之间的互操作性（在 4.4.1 中有介绍）。从加密经济角度上讲，Nervos Network 将价值（而不是信息传递）聚焦到它的根链（Root Chain）上。通过价值捕获，Nervos 的原生代币将会升值；随着网络所承载的总价值增加，网络的安全预算也将会增加。最终，不断上升的原生代币价格，会提升网络的核心价值主张，而不是削弱它。这在章节 4.4 中会详细说明。

## 3\. Nervos Network 核心原则

Nervos 是一个旨在满足去中心化经济需求的分层网络。我们认为分层是构建区块链网络的正确方法，原因有很多。在构建区块链系统时，需要做许多众所周知的权衡，比如去中心化与可扩展性、中立与兼容、隐私与开放、价值存储与交易成本、密码安全与用户体验等等。我们认为，所有这些冲突的产生都是因为人们试图用单一的区块链来解决完全相反的问题。

我们认为构建一个系统的最佳方法不是构建一个能够包罗万象的单层，而是将关注点解耦并在不同的层次处理它们。这样一来，Layer 1 区块链则可以专注于成为安全、中立、去中心化和开放的公共基础设施，而较小的 Layer 2 网络则可以被专门设计为最适合其使用环境的网络。

在 Nervos Network 中，Layer 1 协议（Common Knowledge Base，简称 CKB）是整个网络的价值存储层。它从哲学上受到了比特币的启发，是一个开放的、公有的、基于工作量证明的区块链，旨在最大程度地保证安全性和抗审查性，并充当去中心化价值和加密资产的托管者。Layer 2 协议在 Layer 1 区块链的安全性之上，提供了无限的可扩展性和最低的交易费用，并允许在信任模型、隐私性和最终性方面针对特定应用做权衡。

以下是 Nervos Network 设计的核心原则：

+   一个可持续发展的、多资产 Layer 1 区块链在加密经济设计上必须成为一个价值存储平台；
    
+   Layer 2 提供了最佳的扩展方案，带来几乎无限制的交易处理能力、最低的交易成本，并提升了用户体验。Layer 1 区块链在设计上应该与 Layer 2 互补，而不是与 Layer 2 竞争；
    
+   以工作量证明机制作为抵抗女巫攻击的方法，对于 Layer 1 区块链来说至关重要；
    
+   Layer 1 区块链必须要为交互式协议和区块链的互操作性提供通用编程模型，并最大程度地允许协议的可定制性，且易于升级；
    
+   为了最优地分配资源并避免「公地悲剧」，状态存储必须要有清晰且颗粒度细的所有权模型。为了向矿工提供持续的长期回报（不受交易需求的影响），状态占用必须要有持续的成本。
    

## 4\. Nervos 共同知识库

### 4.1 概览

「共同知识（Common Knowledge）」被定义为每个人或几乎每个人都知道，而且每个人都知道其他人知道的知识，它通常与使用该术语的社区有关。在区块链语境中，「共同知识」指的是经过全球共识验证并被网络中的所有人接受的状态。

共同知识的这个属性使得我们能够将存储在公有链上的加密货币作为货币。例如，比特币上所有地址的余额和历史记录对比特币用户来说都是共同知识，因为他们可以独立地复制共享的账本，验证自创世区块以来的全局状态，并且知道其他人也可以这样做。共同知识使人们能够进行点对点交易而不需要信任任何第三方。

Nervos 共同知识库（Common Knowledge Base，简称 CKB）旨在存储所有类型的共同知识，而不局限于货币。例如，它可以存储用户自定义的加密资产，比如可互换（Fungible）和不可互换（Non-fungible）的代币，以及有价值的密码学证明，从而为更上层的协议提供安全性，例如支付通道（5.2）和 Commit-chains（5.4）

比特币和 Nervos CKB 都是共同知识的存储和验证系统。比特币将其全局状态存储为 UTXO 集，并通过比特币脚本验证状态转换。Nervos CKB 泛化了比特币的数据结构和脚本功能，将其全局状态存储为一组活动可编程单元（称为 Cell），并通过在虚拟机中运行的用户自定义的图灵完备脚本验证其状态转换。

Nervos CKB 具备与以太坊类似的所有智能合约功能，但与其他智能合约平台的不同之处是，Nervos CKB 采用了一种用于共同知识存储的经济模型，而不是为去中心化计算进行支付而设计的经济模型。

### 4.2 共识

比特币的中本聪共识（Nakamoto Consensus，简称 NC）因其简单的设计和较低的通信开销而广受好评。然而，NC 存在两个缺点：1）其交易处理吞吐量远远不能达到人们的需求；2）它容易受到自私挖矿攻击，攻击者可以通过偏离协议规定的行为获得额外的区块奖励。

CKB 共识协议是 NC 的一种变体，它在保持其优点的同时，提高了其性能极限和对自私挖矿的抵抗能力。通过识别并消除 NC 的区块传播延迟瓶颈，CKB 共识协议能够在不牺牲安全性的前提下，支持非常短的区块间隔。缩短的区块间隔不仅可以增加吞吐量，还能够降低交易确认延迟。CKB 的共识协议会在难度调节过程中计算所有有效区块，所以这让自私挖矿不再有利可图。

#### 4.2.1 增加吞吐量

Nervos CKB 使用源自于中本聪共识的共识算法提高 PoW 共识的吞吐量。该算法使用区块链的孤块率（不属于权威链有效区块的百分比）作为网络连通性的度量。

该协议设定固定的孤块率作为调节目标，当孤块率低时，目标难度会降低（提高出块率）；当孤块率超过设定的阈值时，目标难度增加（降低出块率）。

这样的设计能够充分利用网络的带宽能力。低孤块率表明网络连接良好，可以处理更大的数据传输。在这样的情况下，协议会增加吞吐量。

#### 4.2.2 消除区块传播瓶颈

区块传播是所有区块链网络的瓶颈。Nervos CKB 共识协议通过设计将交易确认修改为两步交易确认机制来消除区块传播瓶颈：1）交易提出（Propose），2）交易确认（Commit）。

一笔交易必须首先在区块（或其中一个叔块）的「提出区域」（Proposal Zone）中提出交易。如果交易在被提出后的一定时间内，出现在一个区块的「确认区域」（Commitment Zone）中，则该交易就会被确认。这样的设计消除了区块传播瓶颈，因为一个新块的确认交易在被提出时就已经被所有节点接收和验证。

#### 4.2.3 减少自私挖矿攻击

对 NC 的最主要的攻击之一是自私挖矿。在这类攻击中，恶意矿工通过故意使其他人挖出的区块变成孤块，而获得不公平的区块奖励。

研究人员发现，这种不公平盈利机会的根源在于 NC 的难度调整机制，它在估算网络计算能力时忽略了孤块。这将导致挖矿的难度会更低以及单位时间内的区块奖励会更高。

Nervos CKB 共识协议在调节难度时将叔块考虑在内，这使得自私挖矿不再有利可图。无论攻击策略或持续时间如何，矿工都无法通过诚实挖矿和自私挖矿的任何组合来获得不公平的回报。

我们的分析结果表明，通过两步交易确认的设计，实际自私挖矿会因为攻击的时间窗口有限，而在一定程度上被消除。

关于 CKB 共识协议的详细介绍，请参阅[这里](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0020-ckb-consensus-protocol/0020-ckb-consensus-protocol.md)

#### 4.2.4 工作量证明 vs. 权益证明

工作量证明（PoW）和权益证明（PoS）系统都容易受到中心化带来的影响，但是不同的系统性质会为权益大户带来非常不同的实际操作。

如果没有严格地成本监管，PoW 挖矿产生的实际支出可能超过挖矿收益。因此 PoW 中的权益大户需要持续创新，追求合理的商业战略，并持续投资基础设施以保持自己的主导地位。挖矿设备、矿池运营和廉价能源的获取都会受到技术创新的影响，要长期保持这三者的垄断是很困难的。

与此相反，PoS 系统中的出块节点则会根据所押金额，以确定的方式获得奖励，并且对其运营资本的要求非常低。随着系统的发展，先发者的天然优势也会增加。在 PoS 系统中，权力可能会集中在少数几个 Staker 手中。虽然 PoW 系统也会有类似挖矿集中的问题，但是在 PoS 系统中保持权力优势的成本会明显更低。

此外，PoS 的验证者具有一个特殊的权力：对验证者集的控制。允许验证者加入共识组的交易的接受权掌握在现有验证者手中。通过交易审查和订单操纵来影响验证者集的行为将很难被发现，且难以惩罚。相反的，PoW 系统的共识参与是真正开放的，不受当前权力结构的制约。系统的早期参与者没有得到好处。

就代币经济学而言，虽然人们相信 Staking 能够吸引哪些希望获得收益的资本（从而增加对原生代币的需求），但这并不全面。所有 PoS 项目最终将看到它们的质押率会稳定下来，进入和离开质押资本池的资本将大致相同。这种质押机制本身不会增加人们对原生代币的需求。换句话说，尽管在项目初始阶段（随着质押率的上升），引入 Staking 为人们提供了对原生代币的需求，但是仅使用 Staking 并不能提供对原生代币的长期需求，因此它不能成为原生代币的唯一内在价值。

长期代币持有者在 PoS 系统中有 3 个选择：1）管理基础设施和运行自己的验证节点以获得新发行的代币，2）把代币委托给第三方，并信任第三方的诚实性和基础设施，3）让他们手中的代币价值由于代币的持续发行不断稀释。然而对于长期的、以价值存储为目标的代币持有者来说，以上的三个选项没有一个是特别具有吸引力的。

我们认为，PoW 的无需许可参与的特性是作为全球经济活动基础设施的一项要求。Layer 1 的首要目标是确保区块链尽可能去中心化、安全、中立。PoS 系统在去中心化经济中发挥着一定的作用，但我们认为，它们不满足需要真正开放和去中心化的 Layer 1 的要求。

#### 4.2.5 工作量证明函数

任何节点都可以在 Nervos CKB 中出块，只要它能够证明：1）该区块是有效的；2）出块者已经解出了一个计算上的难题，也就是我们称作的工作证明。工作证明难题是根据提出的块来定义的；这保证了难题的解和区块一一对应，并能够唯一地证明这一个块。

比特币的工作量证明需要找到一个有效的随机数，以证明在区块头计算的哈希函数结果满足一定难度要求。比特币的哈希函数是两次 SHA2-256。虽然 SHA2 对于比特币来说是一个不错的选择，但对于后来的加密货币来说就不一样了。已经有大量的专用设备被研发出来挖比特币，其中大部分都由于新矿机效率的提高而被淘汰，处于闲置状态。

对于一个新的加密货币，若使用同样的工作量证明难题将会让被淘汰的硬件再次得以利用。即使没有过时的硬件也能被租赁或用于挖新币。结果就是，算力分布变得非常难以预测，也可能遇到突然的算力大幅度波动。这个论点也适用于为 SHA2 量身定制的算法优化，这些优化也是为了使函数的软件计算更便宜而开发的。

对于一个新的加密货币来说，设计一个没有被其他加密货币使用过的工作量证明函数难题是非常有意义的。对于 Nervos CKB 而言，我们会更进一步，选择去定义一个全新的工作量证明函数，由于它是新的，因此预先没有任何优化。

另外，挖矿设备达不到预期的情况仅会出现在最早期。从长远来看，部署专用的挖矿设备将会是有益的，这大大增加了攻击网络的难度。因此，新加密货币的理想工作量证明函数除了应该是新的以外，也应该是简单的，这样它能够显著地降低专业挖矿设备开发的门槛。

第三个设计目标显然是安全性。虽然一个已知的漏洞可以被所有的矿工平等地利用，但是只会导致更高的难度；而一个未公开的漏洞则可能会导致挖矿优势，为漏洞的发现者提供超过其贡献的算力份额的优势。为了避免这种情况，最好的方法是为系统的安全性做一个强有力的论证。

#### 4.2.6 Eaglesong

Eaglesong 是专门为 Nervos CKB 工作量证明设计的新的哈希函数，但也适用于其他需要安全哈希函数的应用场景。其设计标准正是上面列出的那样：新颖、简单和安全。我们希望一个设计能足够的新颖，以推动科学向前迈出一小步，同时又足够地接近现有的设计，以提出强有力的安全论证。

为此，我们选择使用由 ARX 操作构建的置换（添加、转换和 xor）实例化 sponge 结构（与 Keccak/SHA3 相同），其安全性的论证是基于宽径策略（与 AES 的基本论证相同）。

就我们所知，Eaglesong 是第一个成功地结合了所有这三个设计原则的哈希函数（或函数）。

您更多关于 Eaglesong 的信息请阅[这里](https://medium.com/nervosnetwork/the-proof-of-work-function-of-nervos-ckb-3cc8364464d9)

### 4.3 Cell 模型

Nervos CKB 使用 Cell 模型，这是一种新的结构，可以提供（以太坊采用的）账户模型的许多优点，同时保留（比特币采用的）UTXO 模型的资产所有权和基于验证的属性。

Cell 模型是关注状态的数据模型。Cell 包含任意数据，这些数据可以很简单，比如代币数量和所有者，也可以更复杂，比如为代币转账指定验证条件的代码。CKB 的状态机执行与 Cell 关联的脚本，以确保状态转换的完整性。

除了存储自己的数据，Cell 还可以引用其他 Cell 中的数据。这允许将用户拥有的资产和控制它们的逻辑分离。这与基于账户模型的智能合约平台形成了对比，在基于账户的智能合约平台中，状态是智能合约的内部属性，必须通过智能合约接口访问。在 Nervos CKB 中，Cell 是可拥有的独立状态对象，可以直接被引用和传递。Cell 可以表示属于其所有者的真正的「可承载资产（Bearable Assets）」（就像 UTXOs 是比特币所有者的可承载资产一样），同时引用包含逻辑的 Cell，以确保状态转换的完整性。

Cell 模型中的交易也是状态转换证明。交易的输入 Cell 从当前 Cell 集合中移除，输出的 Cell 添加到该集合中。当前 Cell 包含 Nervos CKB 的全局状态，并且是不可变的：一旦创建了它们，就不能更改它们。

Cell 模型的设计具有可适应性、可持续性和灵活性。它可以被描述为一个通用的 UTXO 模型，并且可以支持用户定义的代币、智能合约和不同的 Layer 2 协议。

如果想更深入地了解 Cell 模型，请参阅[这里](https://medium.com/nervosnetwork/https-medium-com-nervosnetwork-cell-model-7323fca57571)

### 4.4 虚拟机

许多下一代区块链项目都在使用 WebAssembly 作为区块链虚拟机的基础，但 Nervos CKB 采用的是一种独特的，基于 RISC-V 指令集构建的虚拟机（CKB-VM）设计。

RISC- V 是一个开源的 RISC 指令集架构，创建于 2010 年，用于促进新型硬件和软件的开发。RISC-V 是一个免版税、被广泛理解和广泛审计的指令集。

我们发现在区块链语境中使用 RISC-V 有很多优点：

+   稳定性：RISC-V 核心指令集已经最终确定和固定，并得到了广泛的部署和测试。RISC-V 核心指令集是固定的，并且从不需要更新。
    
+   开源和广泛的支持：RISC-V 是在 BSD 许可下提供的，并得到GCC和LLVM等编译器的支持，目前正在开发 Rust 和 Go 语言实现。RISC-V 基金会包括超过 235 个成员组织，以促进指令集的开发和支持。
    
+   简洁和可扩展：RISC-V 指令集很简单。由于支持 64 位整数，这个集合只包含大约 102 条指令。RISC-V 还为扩展指令集提供了模块化机制，使高性能密码算法能够进行向量计算或支持 256 位整数。
    
+   精准的资源定价：RISC-V 指令集可以在物理 CPU 上运行，提供执行每条指令所需的机器运转周期的准确估计，并告知虚拟机资源定价。
    

CKB-VM 是底层的 RISC-V 虚拟机，它允许灵活的、图灵完备的计算。通过使用广泛实现的 ELF 格式，CKB-VM 脚本可以用任何可以编译成 RISC-V 指令的语言开发。

#### 4.4.1 CKB-VM 和 Cell 模型

一旦部署，现有的公有链或多或少是固化的。若想要升级基本组件（如密码学原语）可能需要花上长达多年的时间，或者直接就无法实现。

CKB-VM 则是从更底层开始考虑设计，它将以前内置在自定义 VM 中的原语移动到虚拟机之上的 Cell 中。尽管 CKB 脚本比以太坊中的智能合约更底层，但是它们具有很好的灵活性，并为不断发展的去中心化经济提供了一个反应迅速的平台和基础。

Cell 可以存储可执行代码，并能够将其他 Cell 作为依赖项引用。几乎所有的算法和数据结构都可以作为存储在 Cell 中的 CKB 脚本实现。通过保持 VM 尽可能简单并将程序内存装载到 Cell 中 ，更新关键算法就像将算法加载到 Cell 并更新现有引用一样简单。

#### 4.4.2 在 CKB-VM 上运行其他虚拟机

因为 CKB-VM 的底层特性和 RISC-V 社区中的诸多实用工具，我们可以很容易地将其他 VM（如 Ethereum 的 EVM）直接编译到 CKB-VM 中。这有几个优点：

+   在其他虚拟机上运行的使用专用语言编写的智能合约，可以很容易地被移植到 CKB-VM 上运行。（严格地说，它们将在自己的 VM 上运行，这些 VM 再被编译并运行到 CKB-VM 内。)
    
+   即使状态转换的规则被编写在除 CKB-VM 之外的虚拟机中运行，CKB 也可以验证 Layer 2 交易争议解决的状态转换。这是支持去信任的 Layer 2 通用侧链的关键需求之一。
    

关于 CKB-VM 的技术演示，请参阅[这里](https://medium.com/nervosnetwork/an-introduction-to-ckb-vm-9d95678a7757).

### 4.5 经济模型

Nervos CKB 的原生代币「Common Knowledge Byte」， 缩写为 CKByte。CKByte 允许代币持有者占用区块链的总状态存储的一部分。例如，通过持有 1000 个 CKByte，用户可以创建一个容量为 1000 字节的 Cell，或者总容量为 1000 字节的多个 Cell。

CKByte 持有者在 CKB 上使用 CKByte 存储数据会有一定的机会成本，他们无法将占用的 CKByte 存入 NervosDAO 以获得部分的二级发行。CKByte 由市场定价，这就为用户提供了一种主动释放状态存储的经济动机，以满足扩展状态的高需求。在用户释放状态存储之后，他们将收到相当于其数据占用状态大小（以字节为单位）的 CKByte。

CKB 的经济模型通过原生代币的发行制度来限制状态增长，让全节点的参与门槛保持较低的水平，并且确保去中心化。由于 CKByte 成为稀缺资源，因此它会被定价并且会以最有效的方式进行分配。

Nervos Network 的创世区块总量为 336 亿 CKB，其中 84 亿将立即被销毁。之后的 CKByte 发行包括两个部分——基础发行和二次发行。CKByte 的基础发行部分总量有限（336 亿 CKByte），发行规则类似于比特币。基础发行部分的区块奖励大约每四年减半一次，直到发行完毕。所有的基础发行都将发放给矿工，作为保护该网络的奖励。二级发行的固定发行速率为每年 13.44 亿 CKByte，其目的是为状态存储空间的占用征收机会成本。基础发行停止后，将只会有二级发行。

Nervos CKB 包含一个称为 NervosDAO 的特殊智能合约，它的作用是抵御二级发行所带来的通胀影响。CKByte 持有者可以将代币存入 NervosDAO，并获得一部分二级发行的代币，这完全抵消了二级发行的通胀影响。对于长期代币持有者而言，只要他们将代币锁定在 NervosDAO 中，二级发行的通胀效应就只是名义上的。由于抵消了二级发行的影响，将 CKByte 存在 NervosDAO 的持有者实际上就如同持有了像比特币那样有硬顶的代币。

当 CKByte 用于存储状态的时候，就不能通过 NervosDAO 来获得二级发行的奖励。这让二次发行成为一种恒定的通胀税，或者是对占用状态存储的「状态租金」。这样的经济模型让状态存储费用与占用的空间和时间成正比。与使用「一次性付费，永久占用」模型的其他平台相比更具可持续性，并且比其它需要明确付款的状态租赁方案更具可行性和用户友好性。

矿工可以同时获得区块奖励和交易手续费。当矿工挖到一个区块时，他们会获得这个区块所对应的所有基础发行和部分的二次发行。所对应的部分依据占用的状态来决定，举例来说：如果目前所有原生代币的一半被用于存储状态，那么矿工将获得这个区块一半的二次发行作为奖励。有关二级发行分配方式的其他信息将在下一节（4.6）中进行说明。从长期来看，当基础发行停止时，矿工仍将获得独立于交易、但与 Nervos CKB 状态占用相关的「状态租金」收入。

类似地，CKByte 可以看作是土地，而存储在 CKB 上的加密资产可以看作是房屋。建造房屋需要土地，CKByte 需要在 CKB 上存储资产。随着在 CKB 上存储资产的需求增加，人们对 CKByte 的需求也随之增加。随着所存储资产的价值上升，CKByte 的价值也会上升。

通过这种设计，人们对于多资产的需求可以转化为对单个资产的需求，并且可以采用和保护比特币系统安全相同的激励制度。矿工们会得到以 CKByte 为单位的区块奖励，CKByte 会随着需求的增加而增值，从而增加整个 Nervos Network 的安全预算。

有关经济模型的更多信息，请参阅[这里](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0015-ckb-cryptoeconomics/0015-ckb-cryptoeconomics.md).

### 4.6 财政部

那些不发放给 1）矿工，2）将代币锁定在 NervosDAO 中的长期持有者的二级发行部分，将被放入名为「财政部」的特殊基金中。举例来说：如果 CKByte 的 60% 用于存储状态，30% 存入 NervosDAO，矿工们将获得 二级发行的 60%，NervosDAO（长期持有者）将会收到二级发行的 30%，10% 的二级发行将进入到财政部中。

财政部基金将用于资助正在进行的针对协议的研究和开发，以及 Nervos Network 生态系统的建设。财政部基金的运用会是开放、透明，并且上链让人人都可以看到。与基于通货膨胀的财政融资模型相比，该模型没有稀释长期代币持有者（将代币存入 NervosDAO 中的持有者）的持币比例。协议开发的资金将完全地来自于短期代币持有者的机会成本。

财政部的资金并不会在 Nervos CKB 主网启动时立刻被激活。它只会在 Nervos 基金会用完包含在创世区块中的生态基金之后，才会通过硬分叉来激活使用。在激活财政部的基金之前，这部分的二级发行将会被烧毁。

### 4.7 治理

治理是指社会或团体内部组织决策的方式。系统中的每一个利益相关群体都应该被包含在这一个过程中。在区块链中，这些利益相关者不仅仅应该包括用户、持币者、矿工、研究员和开发者，还应该包括如钱包、交易所、矿池等的服务供应商。各利益相关方的利益各不相同，想要对齐每个人的利益几乎是不可能的。这也是为什么区块链治理是一个复杂且具争议性的话题。如果我们把区块链看做是一个大型的社会实验，那么治理就需要有比系统中其他任何部分都要精密的设计。经过十年的迭代之后，我们依然没有在区块链中看到一个公认的最佳实践或者可持续的流程。

有些项目通过一个「终生仁慈的独裁者」进行治理（就像 Linus Torvalds 对 Linux 的治理一样）。我们承认这确实能让一个项目变得很高效、有凝聚力并且具有吸引力：因为人们都喜欢英雄；但是，它和区块链的核心价值——去中心化相矛盾。

有一些项目将治理委托给一些有着深远决策能力的优质链下委员会，例如 EOS 上的 ECAF（EOSIO 的核心仲裁法庭）。然而，这些委员会缺乏必要的权力以确保参与者能遵守他们的决定，这也可能是今年早些时候决定关闭 ECAF 的原因之一。

有些项目，比如 Tezos 则想的更远，他们实行了链上治理，来确保所有的参与者会遵守投票出来的决定。这也能够避免任何因开发者和矿工（或者全节点用户）之间的冲突所带来的影响。请注意，链上治理与简单的链上投票不同，如果一个被提议的功能或修正通过链上治理获得了足够的选票，那么链上的代码就会自动更新，矿工或者全节点没有任何办法来控制这个改变。Polkadot 采用了更复杂的方式进行链上治理，它通过选出来的委员会，以及股权加权投票和正负偏差机制的公投程序来计算投票率。

然而，尽管链上治理非常直接，但从他实际的推行来看并不如所呈现的这么优雅。首先。投票只能影响持币者的利益，然而却忽略了其他各方参与者。其次，低投票率是在区块链和真实世界都长期存在的问题。当只有少数人投票的时候，结果又如何能符合大多数人的最大利益呢？最后但也是最重要的一点是，硬叉应该始终被视为所有利益相关者的最终追索权。由于广泛可复制的无需许可区块链提供了极好的数据可得性，所以在完整的保留数据且不被中断的情况下从既有的区块链中分叉出来一条新链，应当始终是一个选项。通过链上治理的方式永远无法实现硬分叉。

关于治理的问题目前人们还没有一个切实可行的答案，所以 Nervos Network 的治理方案会持续迭代。在早期，Nervos 基金会将会担任项目的治理主体。Nervos 基金会是一个设立在巴拿马的、由独立委员会组成的基金会。基金会的任务是让 Nervos Network 能有更长远的发展，以及建设其生态系统并推动落地。

随时间发展，越来越多的代币会被挖出来，挖矿会变得越来越分散，并且会有更多的开发者加入，治理的责任将会逐渐的转移到社区。长期而言，以社区为主体的治理将会管理协议升级的过程以及财政部的资源分配。

Nervos CKB 旨在成为一个可以持续数百年的去中心化自治基础设施，这意味着无论网络如何发展，都有几件确定的事需要我们作为一个社区尽最大的努力去保持真实。这三件不变的核心是：

+   发行的时间表是完全固定的，不会被改变；
    
+   储存在 Cell 中的状态或数据不会被篡改；
    
+   既有脚本的语意不会被更改。
    

以社区为主体的区块链治理是一个非常新的领域，并且有非常多有价值的实验正在进行中。我们意识到这一话题并非无关紧要，人们需要时间去充分的学习、观察、迭代以求达到一个最佳的解决方法。我们虽在短期对于以社区为主的治理采取较为保守的方法，但长期而言，我们将完全致力于（社区为主的治理）这个方向。

## 5\. Layer 2 解决方案概览

### 5.1 Layer 2 是什么？

在区块链网络中 Layer 1 非常受限。一个理想的 Layer 1 区块链在安全性、去中心化和可持续性方面不会做任何妥协，然而，这就带来了区块链关于可扩展性和交易成本上的挑战。Layer 2 解决方案构建在 Layer 1 协议之上，允许将计算转移到链下，并有相关机制安全地回到 Layer 1 区块链上进行结算。

这类似于目前银行体系或 SEC 授权的监管文件中的净额结算。通过减少需要全局共识的数据量，网络可以为更多的参与者提供服务，促进更多的经济活动，同时仍然保持权力去中心化的性质。若不如此做则无法为如此大体量的经济活动提供服务。

Layer 2 用户依赖于 Layer 1 区块链提供的安全性，并会利用这样的安全性在层与层之间转移资产或解决纠纷。这样的结构类似于法院系统：法院不必监督和验证所有交易，而只是作为记录关键证据和解决争端的场所。类似地，在区块链的环境中，Layer 1 区块链允许参与者在链下进行交易，并且在出现分歧的情况下，参与者能够向区块链提供密码学证据（保障自己资产安全性），并对不诚实的行为进行惩罚。

### 5.2 支付和状态通道

支付通道建立在经常交易的双方之间。它们提供了一种低延迟、即时的支付的体验，这在需要全局共识的区块链上是做不到的。支付通道的功能类似于酒吧账单的工作原理——你可以和酒保一起打开账单，继续点饮料，你只需要在离开酒吧时付清账单并支付最终金额即可。在支付通道的操作中，参与者会交换包含对其余额进行加密验证的消息，并且在准备关闭通道，在区块链上结算余额之前，可以无限次地离线更新这些余额。

支付通道可以是单向的，也可以是双向的。单向支付通道从甲方通向乙方，类似于上面酒吧账单的例子。甲方存入可能在乙方处消费的最高金额，然后随着货物或服务不断被收到，慢慢地与签名将资金转给乙方。

双向支付通道更复杂，但是它开始展示了 Layer 2 技术为我们带来的可能性。在这些支付通道中，资金在各方之间来回流动。这样一来，支付通道可以实现「再平衡」，并且可以通过共享交易对手方进行跨通道支付。这使得支付通道网络成为可能，比如比特币的闪电网络。如果甲方可以通过中介找到一条与甲乙双方都有联系的通道，那么资金就可以从甲方转到乙方，而不需要建立它们之间直接的通道。

正如支付通道可以扩展链上支付，状态通道也可以在链上扩展任何类型的交易。支付通道仅限于管理双方之间的余额，而状态通道是关于任意状态的协议，支持从去信任的国际象棋游戏到可扩展的去中心化应用程序的所有内容。

与支付通道类似，双方将打开通道，随着时间的推移交换加密签名，并向链上智能合约提交最终状态（或结果）。然后，智能合约将基于此输入执行，根据合约中编码的规则执行交易。

「广义状态通道」是一种功能强大的状态通道构造，它允许单个状态通道支持跨多个智能合约的状态转换。这减少了「每个应用程序一个通道」结构中固有的状态膨胀，它还允许使用用户已打开的现有状态通道方便地登录。

### 5.3 侧链

侧链是一个独立的区块链，它通过双向锚定连接到无信任区块链（主链）上。要使用侧链，用户可以将资金发送到主链的指定地址上，并将这些资金锁定在侧链运营商的控制之下。一旦这笔交易得到确认，并且安全期已经过去，就可以向侧链运营商提供详细的资金存款证明。然后，这些运营商将在侧链上创建交易，并分配适当的资金。这些资金可以在费用低、确认快、吞吐量高的侧链上。

侧链的主要缺点是它们需要一个额外的安全机制和安全假设。最简单的侧链结构是联盟型侧链，它本质上是信任一组运营者的多重签名。在智能合约平台上，安全模型可以通过代币激励，或绑定/挑战/惩罚等类似经济游戏的方式进行微调。

与其他链下通用可扩展解决方案相比，侧链更容易理解和实现。对于能够设计出用户可接受的信任模型的应用程序类型，侧链可以是实用的解决方案。

### 5.4 Commit-chains

在 Commit-chain\[6\]（如 Plasma\[7\]）上，利用具有广泛全局共识的 Layer 1 区块链（根链）上的信任根（Trust Root）构建了二层链。这些 Commit-chain 是安全的；如果链的运营商是恶意的或功能障碍的，用户总是可以通过根链上的机制撤回他们的资产。

我们相信一个 Commit-chain 的运营商可以正确地执行交易并定期向主链发布更新。在任何情况下 Commit-chains 的资产都将是安全的，除非根链上有长期的审查攻击。与联盟型侧链类似，Commit-chain 的设计相比于无信任区块链提供了卓越的用户体验。尽管如此，他们这样做的同时，也维持了更强的安全保障。

Commit-chain 由一组运行在根链上的智能合约来保护。用户将资产存入此合约，然后其运营商在 Commit-chains 上为他们提供资产。运营商将定期向根链发布证明，用户随后可以通过 Merkle 证明的方式证明自己的资产所有权，即「退出」，这样 Commit-chain 的资产就会被撤回到根链上。

以上描述了 Commit-chains 设计的通用概念，它是包括 Plasma 在内的一个新兴协议系列的基础。Vitalik Buterin 和 Joseph Poon 在 2017 年发布的 Plasma 白皮书\[7\]中，提出了一个雄心勃勃的愿景。虽然所有的 Plasma 链目前仅能以资产为基础，只能存储可互换和不可互换的代币的所有权（以及代币转让），但无信任的代码执行（或智能合约）仍然是研究领域非常活跃的一部分。

### 5.5 可验证的链下计算

密码学似乎为昂贵的链上验证动态和廉价的链外计算量身定做了一个工具：交互式证明系统。交互式证明系统是由证明者（Prover）和验证者（Verifier）两个参与者组成的协议。通过来回发送消息，证明者将提供信息以说服验证者某项声明是真实的，而验证者将检查所提供的内容，并拒绝虚假声明。验证人不能拒绝的声明将会被认为是真实的。

验证者不能简单纯粹地单方验证声明的主要原因是效率——通过与证明者交互，验证者可以验证声明，否则验证索赔要求的成本将高得令人望而却步。这种复杂性的差距可能源自于不同的方面：1）验证者可能运行的是轻量级硬件，只支持空间有限或时间有限（或两者皆有限）的计算，2）纯粹的验证可能需要访问一长串充满不确定性的选择，3）纯粹的验证可能是无法实现的，因为验证者不具备某些秘密信息。

虽然重要信息的保密性在加密货币范畴下肯定是一个相关的约束因素，但是在可扩展性的范畴内，更相关的约束因素是链上验证的成本，尤其是与相对便宜的链外计算相比。

在加密货币的范畴内，zk-SNARKs（简洁非交互式零知识证明）受到了极大的关注。该系列的非交互式证明系统围绕运算电路展开，该运算电路将任意计算编码为有限域上的加法和乘法电路。例如，运算电路可以编码「我知道这个 Merkle 树中的一片叶子」。

zk-SNARK 证明是常数大小（Constant-size）的（数百个字节），可以在常数的时间内进行验证，尽管这种验证效率会花费一定的成本：除了基于配对的算法（具体的密码硬度仍然是关注的对象）之外，还需要可信的设置和结构化的参考字符串。

替代证明系统（Alternative Proof Systems）提供了不同的权衡。例如，Bulletproofs 没有可信的设置，并且依赖于更常见的离散对数假设，但却具有对数大小的证明（尽管依然非常小）和线性时间验证机制。在可扩展性方面，zk-STARKs 提供了zk-SNARKs 的另一种替代方案，它没有可信的设置，只依赖于坚不可摧的加密假设，尽管生成的证明大小是对数的规模（并且非常大：数百 kb）。

在诸如 Nervos Network 这样的多层加密货币生态系统的环境中，交互式证明能够将昂贵的证明端（Prover-side）计算搬到 Layer 2，同时只需要在 Layer 1 进行适当的验证端（Verifier-side）工作。这样的方法其实已经有人在研究，例如，在 Vitalik Buterin 的 ZK Rollup 协议\[8\]中：一个无需许可的中继将链外交易收集起来，并定期更新一个 Merkle 树根存储到链上。每个这样根的更新都伴随着一个 zk-SNARK，它表明只有有效的交易被累积到新的 Merkle 树中。智能合约会验证这些证明，并且只有在证明被验证有效时才允许更新 Merkle 根。

上面概述的结构应该能够支持比简单交易更为复杂的状态转换，包括 DEX、多重代币和隐私保护的计算。

### 5.6 基于 Layer 2 的经济模型

虽然 Layer 2 解决方案提供了巨大的可扩展性，但是这可能会对这些系统的代币经济设计提出挑战。

Layer 2 的代币经济可能会涉及对其关键基础设施（如验证者和瞭望塔）的补偿，以及特定于应用程序的激励设计。当有一个基于持续时间的付费模型时，挑剔的 Layer 2 基础架构往往能更加好地运转。在 Nervos Network 中，这种定价结构可以通过支付基于 CKB 机会成本的方法轻松实现。服务提供商可以通过 NervosDAO 向用户收取「安全保证金」的利息。Layer 2 的开发者可以将代币经济模型集中用于激励特定的应用程序。

在某种程度上，这种定价模型也正是用户为存储在 CKB 上的状态付费的方式。他们本质上是在向矿工支付存储费用，这笔费用会通过 NervosDAO 发放的通胀奖励分配给矿工。

## 6\. The Nervos Network

### 6.1 多资产价值存储平台的 Layer 1

我们相信 Layer 1 区块链必须被构建为一个价值存储平台。为了最大限度地实现长期的去中心化，它必须以 PoW 共识为基础，并且围绕状态存储占用而非交易费用来设计其经济模型。CKB 是一个基于工作量证明、多资产、价值储存的区块链，其编程模型和经济模型都是围绕状态而设计的。

CKB 是 Nervos Network 的基础层，具有最强的安全性和最高程度的去中心化。在 Nervos CKB 上持有和处理资产的成本是最高的，但是，它也提供了最高的安全性，并能够非常容易地访问网络中的存储资产，且允许最大程度的可组合性。CKB 最适合那些高价值资产的存储和长期资产的保值。

CKB 是专门为支持 Layer 2 协议而构建的 Layer 1 区块链：

+   CKB 旨在补充 Layer 2 协议，并将重点放在安全性和去中心化上，而不是和 Layer 2 的目标相重叠，比如可扩展性。
    
+   CKB 围绕状态而不是账户来建立其账簿模型。Cell 本质上是自我容纳的状态对象，可以通过交易被引用并在层与层之间传递。这对于分层结构来说非常理想，在层与层之间的引用和传递对象是状态片段，而不是账户。
    
+   CKB 被设计成一个通用的验证机器，而不是计算引擎。这允许 CKB 作为一个加密法庭，来验证链下状态转换。
    
+   CKB 允许开发者容易地添加自定义的密码学原语。这样 CKB 就不会过时，在未来也可以验证各种 Layer 2 解决方案生成的证明。
    

CKB 的目标是成为能够存储世界上最有价值的共同知识的基础设施，在 CKB 上可以部署一流的 Layer 2 生态系统，以提供最高的可扩展性的和最高效的交易。

### 6.2 通过 Layer 2 实现可扩展性

通过分层结构，Nervos Network 可以在 Layer 2 上扩展任意数量的参与者，同时仍可以保持去中心化和资产存储的重要特性。Layer 2 协议可以使用任何类型的 Layer 1 证明或密码学原语，从而在设计交易系统时提供了极大的灵活性和可创造性，以支持不断增长的 Layer 2 用户群。Layer 2 开发者可以在吞吐量、最终性、隐私和信任模型方面做出自己的权衡，以使得这些模型在其应用程序和用户使用场景中起到最好的作用。

在 Nervos Network 中，Layer 1（CKB）用于状态验证，而 Layer 2 负责状态生成。状态通道和侧链是状态生成的示例，然而任何类型的生成验证模式都应该被支持，例如零知识证明生成集。钱包也运行在 Layer 2 上，它可以运行任意逻辑，生成新的状态并将状态转换提交到 CKB 进行验证。Nervos Network 中的钱包会非常强大，因为它们是状态生成者，可以完全控制状态转换。

侧链对开发者非常友好，并提供了良好的用户体验。然而，他们需要依赖于验证者的诚实性。如果验证者有恶意的行为，那么用户就会有丢失资产的危险。Nervos Network 提供了一个开源且易于使用的侧链堆栈，以在 CKB 上启动侧链，该侧链堆栈由名为「Muta」的 PoS 区块链框架和基于它的侧链解决方案「Axon」组成。

Muta 是一个高度可定制的高性能区块链框架，旨在支持 PoS、BFT 共识和智能合约。它具有高吞吐量和低延迟的 BFT 共识「Overlord」，并可以支持不同的虚拟机，包括 CKB-VM、EVM 和 WASM。Muta 具有跨 VM 的互操作性，不同的虚拟机可以同时在一个 Muta 区块链中使用。Muta 大大降低了开发者构建高性能区块链的障碍，同时仍然保证了其最大限度地灵活性以定制他们的协议。

Axon 是一个用 Muta 构建的完整解决方案，它为开发者提供了一个基于 Nervos CKB 的完整并且能够立即使用的侧链，同时也提供了一个实用的安全和代币经济模型。Axon 方案使用 CKB 来对其资产进行安全性托管，并使用基于代币的治理机制来管理侧链验证者。

Axon 侧链和 CKB 之间，以及 Axon 侧链之间相互作用的跨链协议也将会被内置。借助 Axon，开发者可以专注于构建应用程序，而不是构建基础架构和跨链协议。

目前，Muta 和 Axon 都在大力的开发过程中。我们很快就会开源框架，Muta 和 Axon 的 RFC 也在不断完善中。

Layer 2 协议正在研究和开发领域蓬勃发展。我们预见到一个未来，所有的 Layer 2 协议都是标准化的，且可以实现无缝地互操作性。但是，我们需要承认的是，Layer 2 方案目前仍处于持续成熟的过程中，我们仍然需要不断地挑战它们所能做到的极限，并找到它们可以接受的权衡和取舍。我们已经看到了一些早期有前景的解决方案，但是仍然有大量涉及 Layer 2 设计的主题研究需要开展，例如互操作性、安全性和经济模型。在 CKB 主网启动之后，我们将会把大部分的研究工作投入到 Layer 2 协议中。

### 6.3 可持续性

为了长期的可持续性，Nervos CKB 设定了状态存储空间的上限，并对链上的存储进行收费，鼓励用户清除不需要的状态存储。设定有限的状态存储空间，能够保证全节点参与的门槛维持在较低的水平上，这样节点也可以在低成本的硬件上运行。大量全节点的参与增强了去中心化，进而提高了安全性。

Nervos CKB 根据时间对状态存储收取「状态租赁」费用，这缓解了许多区块链在「一次付费，永久存储」模式下所面临的公地悲剧。通过实行「目标通胀」，这种状态租赁机制能够带来更好的用户体验，同时也对状态存储征收了成本。

由于用户可以拥有他们自己的数据所占用的共识空间，所以这种通胀成本是有针对性的。该模型还包含一个允许用户将其状态从共识空间中删除的原生机制。再结合状态租赁的经济激励，状态大小始会终朝着网络参与者所需的最小数据量靠近。

能够让个人独立地拥有状态也能显著地降低开发者成本。开发人员只需要根据其应用程序所需的验证代码存储空间来购买足够的 CKByte，而不需要为了满足所有用户的状态需求而购买 CKByte。每个用户将使用自己的 Cell 去存储代币，并对自己的资产负全部责任。

最后，通过二级增发，状态租赁机制能为矿工提供持续不断的回报。这种可预测的收入能够激励矿工推进区块链的增长，而不是通过分叉有利可图的区块来获得交易费用。

### 6.4 利益对齐

Nervos CKB 的经济模型对齐生态系统中的所有参与者的利益。

Nervos CKB 专为安全的价值存储设计，而不是为廉价的交易费用设计。这一关键定位将吸引有价值存储（Store of Value）偏好的用户，类似于比特币的用户社区，而不是吸引以交易媒介（Medium of Exchange）为偏好的用户。

交易媒介类的平台总是倾向于将区块链网络推向中心化，以追求更高的效率和更低的费用。对于保护网络的基础设施运营商（矿工或验证人）而言，如果没有显著的费用收入，安全性必须要通过通货膨胀来提供资金支持，或者直接出现资金不足的情况。通货膨胀对长期持有者而言是不利的，资金支持不足的安全性对于网络的任何利益相关者都是有害的。

然而，价值储存型的用户对于抗审查性和资产安全有着强烈的要求。他们依靠矿工来提供这些特性，并为他们提供补偿。在价值存储的网络中，这些不同的角色有着一致的利益。

虽然在其他网络中，长期持有者可能被认为是「投机者」，但代币持有者是 Nervos Network 总价值的直接贡献者。这些用户创造了对原生代币的需求，从而增加了网络的安全预算。

通过对齐所有参与者的激励机制，一个团结的 Nervos 社区就会成长起来，网络一致的经济系统也将能够防止硬分叉的出现。

### 6.5 价值捕获和价值生成

如果任何区块链想要在平台所保护的资产价值增长的同时，保持安全性，那么系统就必须有一种机制，能够在所保护的资产价值增加时捕获其价值。通过限定状态存储空间，CKB 让经过共识的状态存储空间成为一种稀缺的、由市场来定价的资源。随着对网络上资产存储的需求增加，状态存储空间（以及 CKB 的原生代币）的价值也将增加。CKB 是第一个能够直接为其原生代币积累价值的多资产平台。

作为一个价值保护平台，CKB 平台的内在价值取决于它能为其所保护的资产提供多少量级的安全性。随着担保资产价值的上升，CKB 经济模型的价值捕获机制能够自动地提高 CKB 的安全预算，以吸引更多的矿工资源，使平台更具安全性，从而提升平台自身的内在价值。这不仅对平台的可持续性非常重要，它还为平台的内在价值提供了一条价值增长的路径——随着平台变得更加安全，它对高价值资产的吸引力也会增强，从而产生更多的需求。很显然，这部分的价值会受限于区块链行业的总价值，但我们相信 CKB 将在这一需求中占据相当大的份额。

随着时间的推移，我们预计 CKB 的经济密度将会增加。CKByte 将被用于高价值的资产存储，而低价值的资产将转移到连接在 CKB 的区块链上，例如 Layer 2 侧链。与直接保护资产不同，CKB 可以被用作信任根，并通过比如几百字节的密码学证明来保护整个侧链的生态系统的安全。这类证明的经济密度非常高，随着 CKByte 的价格大幅上涨，会进一步支撑存储空间的需求曲线：就像一小块土地上建了一座摩天大楼，那么这一小块土地的经济密度就会显著地提高。

最后，通过 NervosDAO 的设计及它「通货膨胀屏障」的功能，长期代币持有者将始终保持其代币在总发行量中的固定百分比，这让原生代币本身成为了一个极好的价值存储标的。

### 6.6 跨越监管鸿沟

无需许可区块链允许资产发行和交易的完全去中心化。这就是它们的价值所在，但也是它们与现实世界的金融和司法体系不兼容的原因。

分层结构的出现可以使得在不受监管的、无需许可区块链上创建符合监管的部分。例如，用户可以将需要去中心化的资产存储在 Layer 1 上，享受这些资产的绝对所有权，还可以在 Layer 2 上处理现实世界的业务，在这一层，他们会受到监管和法律的约束。

以加密货币交易所为例——日本和新加坡等国已经向交易所颁发许可证，并制定了监管要求。符合监管的交易所或全球交易所的分支机构可以创建二层交易链，导入用户身份和资产，然后根据当地监管要求开展合法业务。

分层架构的区块链让现实世界资产的发行和交易成为可能。现实世界的资产可以通过受监管的 Layer 2 侧链流向区块链生态系统，进入无需许可的 Layer 1 区块链，从而使得这些资产能够加入到最大的可组合、去中心化的金融服务生态系统中，并且拥有最大化的价值。

在未来，Nervos Network 也将使用这类 Layer 2 侧链和应用程序作为大规模用户采用的基础，与该领域的领先公司合作。

## 参考

\[1\] Satoshi Nakamoto. "Bitcoin: A Peer-to-Peer Electronic Cash System". 31 Oct 2008, [https://bitcoin.org/bitcoin.pdf](https://bitcoin.org/bitcoin.pdf)

\[2\] Vitalik Buterin. "Ethereum White Paper: A Next Generation Smart Contract & Decentralized Application Platform". Nov 2013 [http://blockchainlab.com/pdf/Ethereum\_white\_paper-a\_next\_generation\_smart\_contract\_and\_decentralized\_application\_platform-vitalik-buterin.pdf](http://blockchainlab.com/pdf/Ethereum_white_paper-a_next_generation_smart_contract_and_decentralized_application_platform-vitalik-buterin.pdf)

\[3\] 比特币每笔交易的平均大小为 250 字节： 每个区块（每 10 分钟）大小：（2 *250* 7,500,000,000）/（24 *6）= 26,041,666,666 字节； 区块链每天增长的大小：26,041,666,666*（24*6）= 3,750,000,000,000 字节； 区块链每年增长的大小：3,750,000,000,000* 365.25 = 1,369,687,500,000,000 字节

\[4\] Gur Huberman, Jacob Leshno, Ciamac C. Moallemi. "Monopoly Without a Monopolist: An Economic Analysis of the Bitcoin Payment System". Bank of Finland Research Discussion Paper No. 27/2017. 6 Sep 2017, [https://papers.ssrn.com/sol3/papers.cfm?abstract\_id=3032375](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3032375)

\[5\] Miles Carlsten, Harry Kalodner, S. Matthew Weinberg, Arvind Narayanan. "On the Instabiliity of Bitcoin Without the Block Reward". Oct 2016, [https://www.cs.princeton.edu/~smattw/CKWN-CCS16.pdf](https://www.cs.princeton.edu/~smattw/CKWN-CCS16.pdf)

\[6\] Lewis Gudgeon, Perdo Moreno-Sanchez, Stefanie Roos, Patrick McCorry, Arthur Gervais. "SoK: Off The Chain Transactions". 17 Apr 2019, [https://eprint.iacr.org/2019/360.pdf](https://eprint.iacr.org/2019/360.pdf)

\[7\] Joseph Poon, Vitalik Buterin. "Plasma: Scalable Autonomous Smart Contracts". 11 Aug 2017, [https://plasma.io/plasma.pdf](https://plasma.io/plasma.pdf)

\[8\] Vitalik Buterin. "On-chain scaling to potentially ~500 tx/sec through mass tx validation". 22 Sep 2018, [https://ethresear.ch/t/on-chain-scaling-to-potentially-500-tx-sec-through-mass-tx-validation/3477](https://ethresear.ch/t/on-chain-scaling-to-potentially-500-tx-sec-through-mass-tx-validation/3477)