# 超越 Loot：探索 Spore DOB-0 协议的无限可能

近日，Spore GitHub 上的[一份 Spore DOB-0 协议](https://github.com/sporeprotocol/spore-dob-721)引起了笔者极大的兴趣。

Spore 是部署在 CKB 区块链上的通用数码物创造协议，它支持图像、链接、视频、音频、文本、代码（例如 Lua 脚本、Markdown）等多种内容类型，生成的 DOB（Digital Object，数码物）不仅不可篡改，而且完全存储于链上。

Spore DOB-0 协议是建立在 Spore 基础之上的第一个协议，也是更加偏向于应用层的一个协议，它和 Spore 的区别类似于 HTTP 协议和 TCP 协议的区别。据描述，这份 Spore DOB-0 协议旨在创建一个灵活的 DNA 字节渲染过程，更通俗地讲，就是介绍如何解析 Spore DOB 的 DNA。虽然这份协议的内容很简短，但其潜力无可估量。

### Spore DOB-0 协议的实现方式

Spore DOB-0 协议针对 “文本” 这一内容类型设置了一个新标准，即在 CKB 区块链的 Cell 中存放 DOB 最重要的东西 —— **DNA**，而不是普通的文本，然后链上的 **Decoder**（解码器）根据 **Pattern** 对 DNA 进行解码，最后在前端进行渲染并展示给用户。

具体来讲：

![](https://www.chaincatcher.com/upload/image/20240417/1713323008052-286624.webp)

1.  用户在铸造 DOB 时，链上合约会读取当前的区块高度和 Cell ID，并对它们进行哈希计算，得到的哈希值为该 DOB 的 DNA。
2.  部署在 CKB 区块链上的 Decoder（解码器）按照创作者或者艺术家预先定义的 Pattern 对 DNA 进行解码。Pattern 是一段字节（bytes），可以是二进制数，也可以是字符串，可以是任何格式，它的格式由 Decoder 决定，需要创作者或者艺术家在用户铸造 DOB 之前就先定义好并上传。Pattern 定义了哪些字节表示什么属性，如何赋值，以及指定 Decoder 的代码位置，等等。
3.  最后，前端（钱包、浏览器、交易平台等）根据 Decoder 解码出来的内容对 DOB 进行渲染并展示给用户。

从上面的流程中，我们可以看到，对于创作者和艺术家而言，他们需要提前创建 Pattern 和 Cluster。在 Pattern 中，创作者和艺术家需要对 DOB 的各种属性进行定义和赋值，所以 Pattern 就是像一本密码本，它决定了 Decoder 如何去解码 DOB 的 DNA。据悉，为了降低用户门槛和方便操作，开发团队后期会推出一款工具，让创作者和艺术家可以像做完形填空那样直接在链上创建一个已包含了 Pattern 的 Cluster Cell。Cluster 类似于 Collection 的概念，但比 Collection 更加灵活、更加独立。通过创建 Cluster 并把 Cluster 对应的 ID 填入 DOB，可以铸造属于这个 Cluster 的 Spore DOB，所以 Cluster 也可被视为 Spore DOB 的目录索引。

对于协议的开发者而言，他们需要提前在 CKB 区块链上部署 Decoder 合约并公开其地址。Decoder 相当于破译者或者说解密人，主要职责就是按照 “密码本”（即上文提到的 Pattern）上的说明来破解 DNA 字符串所表达的信息。由于 CKB 是一条无需许可的公链，所以在可预见的未来，随着越来越多的 DOB 采用 Spore DOB-0 协议标准，会有越来越多的开发者部署各种各样的 Decoder，甚至专门为某些项目定制 Decoder，来供创作者和艺术家们选择。

**对于用户而言，他只要知道创作者或者艺术家公布的 Cluster ID 并在铸造 DOB 时填写 ID，即可铸造属于那个 Cluster 的 Spore DOB，非常简单易操作。**

### 源于 Loot，超越 Loot

Spore DOB-0 协议的灵感来源于 Loot。Loot 是随机生成并存储在以太坊区块链上的冒险者装备，它仅仅只有几行文字，没有数值、没有图像或其他任何东西，这些都被有意地省略了，目的是让其他人可以按照任何方式来阐释和使用它们。

Loot 把属性池，也就是 Pattern 写到了合约当中，相当于 Decoder 和 Pattern 是写在一起的，耦合度很高，所以一个 Loot 合约只能对应一个 Loot NFT 主题。Spore DOB-0 协议把 Pattern 和 Decoder 进行了解耦处理，进一步提高了可组合性，同样一套 Decoder 配合不同的 Pattern，可以有完全不同的 DOB 主题。

Loot 在随机数生成这块儿只有一个维度，也就是生成一个随机数，然后所有的属性池都使用这一个随机数。通过 Spore DOB-0 协议铸造 DOB 时，会生成一个 DNA 字符串，Pattern 中不同的属性池会使用 DNA 中的特定片段来作为随机数，**随机的维度更广。**

**另外，在整体的设计哲学上，Spore DOB 也明显比 Loot 更美。**

首先，铸造 DOB 需要获取 CKB 代币作为 “原材料”，而熔化 DOB 则可以取回占用的 CKB。**这让 DOB 拥有了躯体和灵魂，也有了生与死的概念。**

其次，世界由时间和空间组成，[PoW 本质上是一个去中心化的时钟](https://www.btcstudy.org/2021/10/16/explaining-proof-of-work-as-a-decentralized-clock-echo-version/)，而 Cell 是一个可以存放任何内容类型的空间，PoW + Cell 的组合让 CKB 区块链构建起了一个去中心化的宇宙。在这个去中心化宇宙中，DOB 在诞生时会对时空（区块高度和 Cell ID）进行哈希计算，得到的结果便是它的 “生辰八字”（即 DNA）。所以，通过 Spore DOB-0 协议铸造 DOB 时存在一定的随机性，这一点呼应了现实生活中生命体诞生过程中的随机性。

哈希函数的其中一个特点是抗碰撞性，即仅仅改变输入信息的一个字符也会产生一个完全不同的哈希值，这样能保证**每个 DOB 的 DNA 都是不一样的**，就像现实世界中每个生命体的 DNA 也是不一样的。

Cell 这个单词的中文意思是细胞，在细胞里存放着 DNA，DNA 中包含了生物体最重要的信息，通过培育细胞，我们最后会得到一个生命体，而生命体又可以继续配对、繁衍，持续地进化。通过 Spore DOB-0 协议铸造的 DOB， 拥有强大的灵活性和可组合性，用户可以根据自己的喜好丰富 DNA 所表达的内容，并通过绘画、建模、音乐、文字描述等各种方式在社区中进行展示，甚至还可以在前端接入 AI 大模型，让 DOB 随着大模型的持续迭代而不断进化。

Spore 相比于 Loot 的优点还有很多，比如链上转移 DOB 免交易手续费（矿工费），每一个 DOB 都有 CKB 代币作为价值支撑，等等。推荐阅读之前的文章《[一文看懂 CKB 链上的数码物创造协议 Spore](https://mp.weixin.qq.com/s/qyFOQskBdvVpHJV8x3M5ZA)》以及查阅 [Spore 的官方文档](https://docs.spore.pro/)，这里不再一一介绍。

### Spore DOB-0 协议的未来畅想

DeFi 乐高积木让大家意识到了 “可组合性”的强大威力，不同的 DeFi 协议互相搭配使用、层层集成，巩固、扩展了 DeFi 世界的边界和高度。Spore DOB-0 协议在设计上将 Pattern、DNA、Decoder 三者进行了分离，这样做的好处是**带来了灵活性和可组合性，为后续的生态发展提供无限的可能性。**

“一生二，二生三，三生万物”。由于 DNA 中只保存着 DOB 最重要的属性，抽象度非常高，所以基于 Spore DOB-0 协议铸造的 DOB 就是前面的 “一”，其他任何人都可以不断地去建设、完善、丰富、补充这个 “一”，基于 DOB 进行二创、三创：喜欢图片的人可以把 DOB DNA 的解码结果丢给 Midjourney 等 AI 绘图工具，让其生成各种风格的图像；喜欢影视作品的人可以将 DOB DNA 的解码结果丢给 Sora 等 AI 视频工具，让 DOB 在影视作品中重现；喜欢文学作品的人，可以把 DOB 设定为小说中的角色，等等。

另外，通过 Spore DOB-0 协议铸造的 DOB 还拥有开放性和可扩展性。其他区块链项目可以引用这些 DOB（[Cell 是可引用的存储单元](https://mp.weixin.qq.com/s?__biz=MzkwODI2ODg4Mw==&mid=2247491475&idx=1&sn=b09d0648db1bcbebae5760193d5dd799&scene=21#wechat_redirect)），比如一款全链游戏或者一个 GameFi 项目，可以直接引用 DOB 作为游戏项目中角色、武器、装备等道具信息的底层数据库。而且，还可以让同一套 DOB 在不同的游戏中使用，实现传统 Web2 游戏中道具、武器等无法跨游戏使用的限制。

总之，开放性、灵活性、可组合行、可扩展性，让 Spore DOB-0 协议拥有了无限的想象空间，可以利用它构建出各种可能。没有人现在就能确切地知道未来会发生什么，但基于 Spore DOB-0 协议的生态发展一定值得我们期待。
