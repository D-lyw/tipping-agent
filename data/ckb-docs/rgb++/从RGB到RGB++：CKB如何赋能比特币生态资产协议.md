# 从RGB到RGB++：CKB如何赋能比特币生态资产协议

**摘要（较长）：**RGB 协议是比较有潜力的 BTC 拓展协议，**本质是一种链下计算系统**，它采用了和闪电网络类似的思想：**用户亲自验证并授权和自身相关的资产变动事宜（Verify by yourself）**，把交易发起者认可的结果/承诺提交到比特币链上。

RGB 协议利用了与染色币及 Mastercoin 部分类似的思想，在比特币 UTXO 上关联着「寄生资产」。它把链下交易数据的 Commitment「承诺」，存放到比特币链上，而不是像 Ordinals 协议那样发布完整的 DA 数据。**根据比特币链上记录的承诺值，RGB 客户端可以验证，其他客户端提供的 RGB 历史数据是否有效。**

同时，单凭 hash/Commitment 无法还原背后的原像，外界不能直接观测到链上承诺值对应的链下数据，**这样可以保护隐私，且相比于铭文，只把承诺上链能节省空间。**从第三者的视角看，他其实不知道 RGB 客户端到底干了什么。

![](https://image.blockbeats.cn/upload/2024-02-19/5ca87477b32ec955d5cb52c9992139c094c6f58d.png?x-oss-process=image/quality,q_50/format,webp)

RGB 还利用了比特币 UTXO 一次性花费的特性，**通过名为「一次性密封」的思路，把 RGB 资产所有权，和比特币 UTXO 关联起来。**这样可以借助比特币强大的安全性，避免 RGB 资产被「双花/双重支付」（只要比特币 UTXO 不被双花，RGB 资产就不会被双花）。

但 RGB 作为一个在比特币链下实现的智能合约系统，依赖于不同的客户端在本地存放历史数据，且不同客户端（用户）只存放与自己相关的数据，看不到别人的资产状况。这种「数据孤岛」虽然保护了隐私，但也使得 RGB 在大规模采用上面临麻烦，**更像一个由 OTC 交易者组成的 P2P 网络**。

**RGB++的思路是，用 CKB 链上的 Cell，表达 RGB 资产的所有权关系。**它把原本存放在 RGB 客户端本地的资产数据，挪到 CKB 链上用 Cell 的形式表达出来，与比特币 UTXO 之间建立映射关系，**让 CKB 充当 RGB 资产的公开数据库与链下预结算层**，替代 RGB 客户端，实现更可靠的数据托管与 RGB 合约交互。对于其他基于 UTXO 的 Layer2 而言，这种」同构绑定」是一种趋势。

![](https://image.blockbeats.cn/upload/2024-02-19/d206a66125e3fb35f84348b634e0ed035d5dc83f.png?x-oss-process=image/quality,q_50/format,webp)

RGB 协议本身只支持交互式的转账流程，交易双方要频繁通信，这种模式难以支持 Defi 场景，也不利于 RGB 资产发行。**CKB 替代了独立客户端之后，可以实现非交互的 RGB 交易，利于 Defi 落地和空投等功能**，且支持 BTC 资产无需跨链的与 CKB 链上资产交互。

**RGB++本质是用隐私换易用性，同时带来 RGB 协议无法实现的场景。**如果用户看重产品的简单好用和功能完备性，就会青睐 RGB++，如果追求隐私和 Verify by yourself 的安全，就会青睐传统的 RGB 协议，一切看用户自己的取舍。（**理论上 RGB++也可以通过 ZK 等方法解决隐私问题**）

## RGB 协议的原理及其优缺点

RGB 协议本身是一种比较复杂的方案，我们以一笔具体的 RGB 资产转账为例，为大家解释 RGB 协议是如何工作的。

假设有一种符合 RGB 协议要求的代币，叫 TEST。Alice 希望 Bob 将 100 个 TEST 代币转给自己，换句话说，希望生成一笔 Bob—>Alice 的代币转账。

这里先解释下，**RGB 协议采用了称为「一次性封装」的思路**，表面上说是 Bob 给 Alice 转账，实际是指，Bob 控制着比特币链上的 UTXO A，而 UTXO A 通过某些方法，关联了一些 RGB 资产。

如果 Bob 声明，要把 UTXO A 关联的部分 RGB 资产转让给 Alice，它可以如此声明：**把 UTXO A 关联的 30 枚 TEST 代币，转让给 UTXO B 来关联**。由于 Alice 是 UTXO B 的所有者，所以她就拥有了关联的 30 枚 TEST 代币。

![](https://image.blockbeats.cn/upload/2024-02-19/9c5d31a37c1b4dd7707cbf9d9db57ad19475a581.png?x-oss-process=image/quality,q_50/format,webp)

> （图源：Discoco Labs）

实际上比特币链上的所有权记录方式，都是通过 UTXO 来实现的，声明 UTXO B 有资格控制 xx 数额 RGB 资产，就等价于说 UTXO B 的主人可以控制 xx 数额 RGB 资产，这与我们所习惯的账户地址模型并不一致，是比特币等 UTXO 公链的独特属性。

理解了这里后，我们再考察 RGB 协议的工作流程，可以感受到他与染色币及 Mastercoin 等比特币 UTXO 寄生资产的差异：

1\. 按照 RGB 协议的原理**，Alice 要先为转账交易开具发票 (issues an invoice)，指明自己的意图**。

发票中包含以下信息:

**合约 id：**Alice 声明要与哪个 RGB 资产合约交互

**接口：**让 Bob 了解合约的所有交互接口

**操作：**Alice 让 Bob 去调用的合约接口名

**状态：**Bob 需要修改的合约状态，此例中就是 Bob 转给 Alice 的代币数量

**Seal（密封条）：**用于一次性密封的 UTXO，可以简单理解为，Alice 用来接受 Bob 的 RGB 资产授权的 UTXO。

最后，Alice 会获得一个如下的发票内容:

![](https://image.blockbeats.cn/upload/2024-02-19/f22c676db2a594e8679ea9a20690152fed7fddac.png?x-oss-process=image/quality,q_50/format,webp)

上述发票遵循如下格式：

![](https://image.blockbeats.cn/upload/2024-02-19/2ab26d9675714e47e3633a9736acb354de40b65b.png?x-oss-process=image/quality,q_50/format,webp)

2.**Alice 需要将上述发票发送给 Bob。Bob 会检查发票信息，按照 Alice 的意图来生成新的 RGB 交易，把 RGB 资产转让给 Alice。**

但这里要格外注意，Bob 必须设法证明，自己的确有部分 TEST 资产所有权。至于为何要这么做，是因为 RGB 协议默认「没有全局可见的资产状态记录」，不会像以太坊那样用一个公共托管合约来记录并处理所有人的资产。

RGB 协议下，不同的客户端只记录和自身相关的资产数据，包括这些资产的当前余额、历史来源等，每个客户端记录的数据基本都不一致。这样一来，**每个人都无法确认其他人的资产状况，所以在 P2P 交易时要出示资产证明。**

用一句生动的比喻就是，你和对面在用纸钞进行交易，但你不知道对方的纸钞是不是自己印的假币，你便要求他说清楚，这些纸钞是从哪里弄来的，经过多少人转手，以此来判断对方是否在用假币糊弄你。

![](https://image.blockbeats.cn/upload/2024-02-19/a4d6b0f6ec905b20a9973b42f57e25761da457b0.png?x-oss-process=image/quality,q_50/format,webp)

双方互相认可后，就可以放心大胆的交易，**每一笔 RGB 交易也只需要参与方彼此认可就行，是完全 P2P 的（类似于 OTC）**。

显然，**这种模式可以保护隐私**，因为每个人的资产状况、交易记录，都不会被外界轻易获知，你和交易对手方做了什么，外人很难知道。道理就好比，纸币可以比银行转账更好匿踪。但显然，**这也会在用户体验上造成不便**。

在前面谈到的 Alice 和 Bob 案例中，Bob 收到 Alice 的发票并获知其意图后，要从本地客户端的历史数据中，选出和 TEST 资产相关的历史转账记录，连同新生成的 Bob -> Alice 转账，一起交给 Alice 去校验，**证明新的 RGB 交易/所有权变更，背后对应的资产所有权来源是有效无误的**。

![](https://image.blockbeats.cn/upload/2024-02-19/bcecc19f93b183760226e599656906cee701efd9.png?x-oss-process=image/quality,q_50/format,webp)

一般而言，客户端本地存放的数据称为 Stash「藏品」，包含了 RGB 资产的过往数据。我们可以把 Stash 当做 RGB 资产合约的日志记录。

![](https://image.blockbeats.cn/upload/2024-02-19/8f9bad6e5380fad156ae1793ae2a744fc1ad3148.png?x-oss-process=image/quality,q_50/format,webp)

3\. **当 Alice 从 Bob 那里收到数据，以及新声明的 Bob—>Alice 交易后，会验证其有效性**，如果验证通过，Alice 便会生成一个「确认签名」，返回给 Bob。

4.Bob 收到 Alice 的确认签名后，便把 **Bob—> Alice 交易对应的 Commitment（承诺）广播到 BTC 网络内，最终写入 BTC 链上**，使其具备「最终性」。

![](https://image.blockbeats.cn/upload/2024-02-19/cfea8d0d7359d88b602575e1195a0b2e33914c21.png?x-oss-process=image/quality,q_50/format,webp)

> （Commitment 的结构图，其实本质是个 merkle root）

如果 Bob—>Alice 转账中，声明 UTXO B 的主人将拥有 30 枚 TEST 代币，则 Alice 只要证明自己是 UTXO B 的主人，就可以使用这些 TEST 代币。

5\. 如果未来 Alice 要把 TEST 代币转给别人，当出示这些 TEST 的历史来源时，对方可以根据比特币链上的 commitment 承诺值进行核验，看 Alice 提供的数据能否和链上的承诺值对应。**这样可以防止伪造数据**。

![](https://image.blockbeats.cn/upload/2024-02-19/51e324e6347f9dd33223d0b5d085b92a1175eecd.png?x-oss-process=image/quality,q_50/format,webp)

RGB 协议的好处在于，**可以在链下支持复杂的智能合约计算**。它本质上把计算步骤挪到了 BTC 链下，仅在链上记录 Commitment，在保护隐私的同时，在链下声明比特币 UTXO 和 RGB 资产所有权之间的关联，借助比特币来刻录并实现 RGB 资产的所有权变更。

**由于所有的交易声明都需要由当事人验证并授权，所以其安全模型基于「理性人假设」**，只要当事人是理智的，只要比特币是安全的，RGB 资产所有权就「基本安全」。

但 RGB 协议的缺陷也很明显（前文有提及数据孤岛与碎片化存储问题）。首先，**要给其他人转账，甚至要先得到对方的同意和确认，双方基本要同时在线**；

其次，因为缺乏全局可见的数据记录方式，RGB 的合约发布甚至都采用了非常奇葩的形式，合约使用者要事先从合约发布者处，获知合约包含的接口功能，具体的获知方式可以是通过电子邮件或是扫二维码。（看官方目前的说辞，估计把合约代码挂官网首页、推特置顶也可以）

![](https://image.blockbeats.cn/upload/2024-02-19/cd3812564fffb29a3b8055aff5aaff47c3374ef7.png?x-oss-process=image/quality,q_50/format,webp)![](https://image.blockbeats.cn/upload/2024-02-19/f9f8daeaf3966b001071e7ede81ff06d361897b4.png?x-oss-process=image/quality,q_50/format,webp)

我们再来探讨一下 RGB 协议的合约状态。在 RGB 协议内，合约的初始状态 (Genesis) 由创建者在合约创建时就设置好，比如 RBG-20 合约中的代币名称、总量等。**而后，合约的状态伴随着 RGB 交易的持续递进而变化，但这种合约状态演进是非线性的，构成了一个有向无环图 DAG。**

![](https://image.blockbeats.cn/upload/2024-02-19/3a753c0ee33f1fb4e3f649372bf3cf50861d6348.png?x-oss-process=image/quality,q_50/format,webp)

> （图中 owner1 的视野范围是蓝色和绿色部分，Owner2 视野范围是蓝色和黄色部分）

比如 Bob 给 Alice 转账时，仅出示从合约初始化，到 Bob 获得代币的部分转账记录，包含的数据路径比较狭隘。而 Alice 也仅能获知此路径分支包含的交易信息，难以获知其他人的转账信息。这虽然保护了 RGB 用户的隐私，但也带来了**不良后果：用户很难获知 RGB 合约的全局状态，比如每个人有多少 RGB 资产。**这会带来很多麻烦。

比如，当 Bob—> Alice 转账进行到最后步骤，其承诺值被写入 BTC 链上且不可逆转后，Bob 可以在本地删掉部分数据——假如 Bob 将自己全部的 TEST 代币都给了别人，可以直接把本地存放的 TEST 代币相关数据删掉，以减轻存储压力。

而作为代币接收方的 Alice，则要在本地记录此次交易所涉及的全部数据。（**假如 Bob 删掉了本地的 TEST 代币数据，Alice 的客户端节点又因为事故彻底损坏了，那么此时，Alice 的资产是不是就永久冻结了？**因为没有其他地方存放 Alice 的 TEST 资产数据，除非事先就备份好。）

这本质上可以归结为 **DA 和数据存储问题**，即 RGB 协议的新增数据无法以一种可靠、全局可见的方式传播出去，最终会使得不同的客户端成为「数据孤岛」。此前曾在以太坊生态如日中天，但后来遭到废弃的 Plasma 方案，也是因为无法解决 DA 问题，最终胎死腹中。

此外，**RGB 协议还需要交易双方进行大量通信**，很多通信步骤都要依赖中心化设施，在这块的细节描述还不成熟，官方甚至说可以通过邮件来通信。

比较显然的是，**RGB 协议的设计对于追求易用性的长尾用户不太友好**，虽然拥有较多资产且对隐私有较高追求的大户会乐于做数据备份和客户端维护，但对于长尾用户而言，这些包袱还是太重了，会对大规模采用造成严重阻碍。甚至于到目前，人们大多认为没有出现什么现象级的 RGB 资产。

下图中，我们给出了 RGB 资产转账的流程图，读者可以基于此图更加深刻理解转账的整体流程。

![](https://image.blockbeats.cn/upload/2024-02-19/11b03fd8db0043d3d2d3e8e27c925a2559eb9570.png?x-oss-process=image/quality,q_50/format,webp)

简而言之，RGB 协议借助比特币 UTXO，实现 RGB 资产的所有权变更，并通过在 BTC 链上发布承诺值（Commitment），确保链下数据无法被客户端私自篡改。实际上，RGB 所谓的**「一次性密封」，就是通过链下的 RGB 交易声明，把比特币 UTXO 和 RGB 资产所有权关联起来，以此借助比特币强大的安全性，来保障 RGB 资产安全。**但由于 DA 和数据存储问题，原始 RGB 协议的可用性及 UX 比较差，且资产容易因为数据丢失而冻结（不可用）。

## RGB++：基于 CKB 的加强版 RGB 协议

在上文中，我们总结了 RBG 系统的优点与缺点，其中，客户端数据孤岛、合约状态无法全局可见，构成了影响 RGB 协议易用性的最主要因素。

实际上，**RGB 协议的优点和缺点都很明显**，对隐私和安全有较高追求的人会倾向于自己运行客户端，并做好数据备份，但长尾用户显然没这个耐心（比如，大多数闪电网络用户会依赖于第三方节点，而不是自己去运行客户端）。

基于这个理由，Nervos 联创 Cipher 提出了**名为 RGB++的方案，尝试将 RGB 的资产状态、合约发布与交易验证，委托给 CKB 公链来进行。CKB 充当了第三方的数据托管与计算平台**，不再需要用户自己运行 RGB 客户端。

由于 CKB 本身是拓展的 UTXO 模型（Cell），可以将 RGB 资产的链下信息写入到 Cell 中，并在 Cell 和比特币 UTXO 之间建立 1 对 1 的映射关系，实现基于 CKB 的 RGB 资产数据托管与验证方案，以此解决易用性问题，作为 RGB 原始方案的一种强化补充。

![](https://image.blockbeats.cn/upload/2024-02-19/da64583fb582e737c52258bec1ed98a62de4964d.png?x-oss-process=image/quality,q_50/format,webp)

这段话读起来可能有点绕，对此我们再展开解释一下：

文章前面提到，RGB 协议本质是通过发布链上承诺与链下声明，把比特币 UTXO 和 RGB 资产所有权关联起来。但 RGB 资产合约的数据是碎片化存放在不同客户端本地的，没有一个全局可见的视图。

RGB++通过 CKB 的拓展版 UTXO——Cell，把比特币 UTXO 与对应的 RGB 资产之间的映射关系，直接在 CKB 链上展示出来，并且由 CKB 公链替代用户的 P2P 客户端，验证每一笔 RGB 转账的有效性。有了这样一个全局可见的 RGB 数据记录后，很多难以在 RGB 协议中实现的场景都会更容易落地。

![](https://image.blockbeats.cn/upload/2024-02-19/06bf4321dbd69cf1dab0eb029f0023a59cd8c02b.png?x-oss-process=image/quality,q_50/format,webp)

（RGB++的交易流程，把 RGB 资产信息写入 Cell，再将 Cell 与比特币 UTXO 建立关联，最后把 CKB 上发生的 RGB++交易，以及与 RGB++资产关联的比特币 UTXO，一并包含在承诺里，再把承诺值写到比特币链上）

可能有人第一时间想到了 EVM。我们是否可以用 EVM 承载 RGB 的状态与验证？答案是：很麻烦，因为 RGB 资产本质上寄生于比特币 UTXO，与比特币 UTXO 存在 1 对 1 的映射关系。**如果要把比特币 UTXO 与 EVM 合约数据建立映射关系，在技术实现上并不顺畅，还不如直接选择一条 UTXO 公链。**

而且，以太坊上的「资产」往往是点对池的公共物品，一个合约上记录无数人的资产数据，合约控制者拥有绝对权力，**这种资产处理方式与比特币 UTXO 以及 RGB 协议严重冲突**，后两者的设计思路，是彻底实现资产的私有化，每个人完全控制自己的资产（想想纸币和微信支付的区别），不必考虑以太坊和 EVM 链一贯存在的：资产合约 owner 滥用职权、合约出 bug 导致资金受损、资产合约的数据要迁移时很麻烦等问题。

![](https://image.blockbeats.cn/upload/2024-02-19/7ca9a61ea21d02c3f921a6288fac5c3a3ead333a.png?x-oss-process=image/quality,q_50/format,webp)

> （出自极客 web3 过往文章：《技术圈名人响马：高性能公链难出新事，智能合约涉及权力分配》）

所以，**如果要将比特币 UTXO 与链下 RGB 资产之间的映射关系表达的较为顺畅，最好的选择还是通过 UTXO 链。**而 CKB 支持的是拓展型 UTXO——Cell，且 CKB VM 的指令集基于 RISC-V，比起 EVM 更容易兼容不同的密码学算法，包括比特币的公私钥验证算法，所以更利于实现 RGB++提出的技术方案。

## RGB++的技术实现

RGB++用到了 CKB 的拓展型 UTXO——Cell。而一个 Cell 包含以下字段:

![](https://image.blockbeats.cn/upload/2024-02-19/719b945ae66bed3fd9d9d9f66d49acdc9a510690.png?x-oss-process=image/quality,q_50/format,webp)

Capacity 代表此 Cell 拥有的链上空间大小，data 指 Cell 内包含的数据集，可以被读取或修改。

Type 是这个 Cell 绑定的程序代码，限制了 data 数据的修改条件。比如，你的 Cell 里有 100 枚 TEST 代币的数据，但你声明将 110 枚 TEST 转给别人，这不符合 Type 里规定的限制条件，会被拒绝。

而 Lock 则代表 Cell 的所有权验证逻辑，类似于比特币 UTXO 的解锁脚本。

我们可以把 Cell 理解为升级版的 UTXO，多出了 Type 和 Capacity 这两个字段，且 data 可以自定义数据类型，至于 Cell 的所有权变更方式，和比特币 UTXO 差不多，都是通过解锁脚本来实现。

![](https://image.blockbeats.cn/upload/2024-02-19/da64583fb582e737c52258bec1ed98a62de4964d.png?x-oss-process=image/quality,q_50/format,webp)

**而 RGB++的思路是，用 CKB 链上的 Cell，表达 RGB 资产的所有权关系。**它把原本存放在 RGB 客户端本地的资产数据，挪到 CKB 链上用 Cell 的形式表达出来，让 CKB 充当 RGB 资产的公开数据库。而表示 RGB 资产的 Cell，会和比特币链上的 UTXO 存在 1 对 1 的映射关系，这种映射关系会在 Cell 的 Lock 字段里直接展示出来。

比如说，**假设某个 RGB 资产关联着比特币 UTXO A，则对应的映射版 Cell，可以把自己的所有权验证条件，设置为和比特币 UTXO A 一致**（就是把 Lock 脚本设置为比特币 UTXO A 的解锁条件）。如果你是 UTXO A 的控制者，你就能直接操作 CKB 上的映射 Cell，当然，**CKB 会验证你是不是 UTXO A 的主人**。

CKB 链上会实现比特币轻节点，同步比特币区块头。当你声明 RGB 交易，要对 RGB 资产对应的 Cell 进行操作时，要先证明自己是比特币 UTXO A 的控制者，证明步骤分两步：

1\. 向 CKB 链上实现的比特币轻节点证明，UTXO A 存在于比特币链上，需要出示 Merkle Proof；

2\. 出示数字签名，证明自己是 UTXO A 的所有者。

在 **RGB++方案中，用户在前端声明一笔 RGB 资产转账后，会在 CKB 链上触发一笔交易，对记录 RGB 资产数据的 Cell 进行改写，变更其所有权**。原本可能是比特币 UTXO 1 的控制者拥有这个 Cell，所有权变更后，比特币 UTXO 2 的控制者成为了 Cell 的新主人。这一切都在 CKB 链上可见。

![](https://image.blockbeats.cn/upload/2024-02-19/06bf4321dbd69cf1dab0eb029f0023a59cd8c02b.png?x-oss-process=image/quality,q_50/format,webp)

这里要注意的是，与 BTC 链上承诺相关的工作流程，依然在 BTC 主网进行，就是说 **RGB++仍然要在比特币链上发布 Commitment**，与 CKB 上发生的 RGB 资产交易记录关联起来。这一步与传统 RGB 协议并无不同。

但不同的是，**传统 RGB 协议中由客户端在链下自己负责的工作，都由 CKB 来负责**，比如交易对手方要验证资产来源、客户端要在本地存储资产来源数据、RGB 合约发布要通过第三方渠道等，这些繁琐的包袱都可以由 CKB 负责解决，不需要用户自己运行客户端。

这样解决了 RGB 客户端数据孤岛问题，也解决了合约状态无法全局可见的缺陷。同时，RGB 合约可以直接部署在 CKB 链上，全局可见，供 RGB Cell 来引用，这样就避免了 RGB 协议合约发布时的一系列奇葩操作。

![](https://image.blockbeats.cn/upload/2024-02-19/eaec98e180686daf996d5fe285aba07533930588.png?x-oss-process=image/quality,q_50/format,webp)

概括来讲，**CKB 利用 Cell 脚本的可编程性，先确定 RGB 转账发起者 的确拥有 RGB 资产关联的比特币 UTXO，若验证通过，则允许用户通过转账，将记录 RGB 资产数据的 Cell 转让给别人。**

简而概之，CKB 充当了 RGB 资产的公开数据托管平台，提供了数据存储与全局可见的合约发布功能，也提供了所有权验证与计算功能。更加精简一点来说，就是 CKB 替代了 RGB 中的客户端，并且顺带解决了其他的问题。

当然，RGB++既然实现了全局可见的数据发布，隐私性相比于 RGB 协议必然是降低的，但好处是易用性得到了极大幅度提升。

所以 **RGB++本质是用隐私换易用性，同时能带来 RGB 协议无法实现的场景。**如果用户看重产品的简单好用和功能完备性，就会青睐 RGB++，如果追求隐私和 Verify by yourself 的安全，就会青睐传统的 RGB 协议，**一切看用户自己的取舍**（思路就和 Vitalik 评论以太坊 Layer2 时表达的差不多，追求安全就去用 Rollup，追求低成本就去用 Validium 和 Optimium 等非 Rollup 方案）。当然，**按照 RGB++白皮书中的说法，后续也可以在 CKB 链上实现隐私交易方案，隐藏用户的身份与转账金额。**

## RGB++的附加特性

## 交易的非交互性（非常重要）

原始 RGB 协议的一个重要问题在于，收款方要先向付款方发送一条消息（就是前文说过的支票），指明把自己的一个 UTXO 与 RGB 资产绑定，RGB 转账才能顺利实施。**这就要求收款方与付款方之间经过多道交互式通信，才能完成一笔普通交易**，显然增加了用户的理解难度和产品复杂度。而 RGB++利用了 CKB 作为数据托管与计算平台的特性，允许对手方之间通过异步、非交互的方法来完成转账。

**A 向 B 转账时，只需要事先知道 B 的地址，声明向该地址转账，不需要收款人在线通信或提供数据**。之后，收款人可以自己去领取资产，CKB 链上的脚本代码，会验证收款人是否是付款人指定的那个。显然，这种模式更贴近大多数人的习惯，诸如**空投、奖励分发等原本在 RGB 协议中不支持的模式也可以跑的通，这样也有利于 RGB 资产发行。**

![](https://image.blockbeats.cn/upload/2024-02-19/388d7d017fff3c03ff9b4288d78c36bcc558d448.png?x-oss-process=image/quality,q_50/format,webp)

此外，RGB 协议的工作模式天然不利于 Defi 场景的展开，比如 Uniswap 这种典型的多对多、非交互式的交易池，在原始 RGB 协议中几乎无法展开，而 RGB++实现了非交互式交易、状态全局可见可验证，只要借用 Cell 来实现一个「所有满足条件的人都可以修改其状态的「无主合约」，就可以把很多 Defi 场景落地。

当然，所有人都可以修改其状态的无主合约，很容易出现状态争用/读写冲突，就是好几个人想同时修改合约状态，这样会导致混乱。为了解决这个问题，RGB++计划用一个链上实现的 Intent Cell 作为「排序器」，对不同的请求进行排序。

## 交易折叠（聚合多笔交易的承诺发布）

**交易折叠比较好理解，就是把 CKB 作为一个「链下预结算层」**，等多笔 RGB 转账发生后，把一批交易聚合起来，生成一个对应批量交易的 Commitment，一次性发布到比特币链上。具体表现为以下流程图：

![](https://image.blockbeats.cn/upload/2024-02-19/f7697ed6a9c87270a3cb714c0255c26b03ea15d6.png?x-oss-process=image/quality,q_50/format,webp)

## BTC 资产无需跨链直接与 CKB 链上资产交互

**RGB++ 实现了比特币 UTXO 与 CKB Cell 之间的关联映射后，可以直接实现无需资产跨链的互操作。**你可以通过 RGB++交易声明，把自己的比特币 UTXO 转移给别人，对方可以把自己的 CKB 资产所有权转让给你。这种模式拥有很大的想象空间，结合前面提到的交易折叠（批量交易），理论上可以实现无需 BTC 资产跨链的 BTC——CKB 链上资产互操作。

![](https://image.blockbeats.cn/upload/2024-02-19/f87cc8ac71bbbd2c95d9bff22b1ede4cc09344c5.png?x-oss-process=image/quality,q_50/format,webp)

## 总结

RGB++把存放在不同 RGB 客户端本地的资产数据，直接用 CKB 链上的 Cell 表达出来，再把 Cell 与比特币链上的 UTXO 关联起来。用户可以通过比特币账户/资产，与自己在 CKB 链上的 RGB++资产进行交互。这种方式比较简洁，且**解决了 RGB 协议中 转账需要双方事先通讯、难以支持全局可见的状态、数据存储碎片化、智能合约及 Defi 不友好等问题。**

RGB++无需资产跨链，就可以实现 BTC—CKB 之间的互操作，且便于 RGB 资产与 Defi 场景结合，极大程度解决了 RGB 协议的易用性问题。但对于**追求高度隐私的 RGB 小众玩家而言，RGB++本质是以隐私换易用性，一切还要看用户的取舍**。但理论上来讲，隐私问题可以在 CKB 链上通过引入 ZK 等方法来解决。

整体而言，RGB++展示了 CKB 作为一个比特币链下结算层/计算层的潜力，而这种思路会在未来，被越来越多的比特币 Layer2 或资产协议所采纳，**可以预见的是，比特币链下的第三方结算层间的角逐，或许不久后就会展开**。而主打 POW 和 UTXO、有着多年技术积淀的 CKB，或许能够在这场模块化区块链的角逐中表现出自己的技术优势。

> [原文链接](https://mp.weixin.qq.com/s/PpVSyc4y8QLKbi0cSYTkjA)

**欢迎加入律动 BlockBeats 官方社群：**

Telegram 订阅群：[https://t.me/theblockbeats](https://t.me/theblockbeats)

Telegram 交流群：[https://t.me/BlockBeats\_App](https://t.me/BlockBeats_App)

Twitter 官方账号：[https://twitter.com/BlockBeatsAsia](https://twitter.com/BlockBeatsAsia)