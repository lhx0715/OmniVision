/**
 * Mock 情报引擎
 * 根据查询内容生成 5 种情报卡片的模拟数据
 */
import type {
  EntityType,
  VerdictCardData,
  TimelineCardData,
  AchievementsCardData,
  DarksideCardData,
  GameplayCardData,
  TrendCardData,
  IntelCard,
  IntelSource,
} from '@shared/types.js'

interface EntityProfile {
  verdict: VerdictCardData
  timeline: TimelineCardData
  achievements: AchievementsCardData
  darkside: DarksideCardData
  gameplay: GameplayCardData
  trends: TrendCardData
}

// ============== 知识库：已知实体 ==============
const KNOWLEDGE_BASE: Record<string, { entityType: EntityType; profile: EntityProfile }> = {
  马斯克: {
    entityType: 'HUMAN',
    profile: {
      verdict: {
        title: '现实版钢铁侠：一个把"不可能"当 KPI 的科技狂人',
        subtitle: '同时操盘五家颠覆性公司的多重创业者，争议与天才并存',
        tags: ['连续创业者', '首富', '口无遮拦', '火星移民信徒', '工作狂'],
      },
      timeline: {
        events: [
          { year: '1971', title: '出生于南非比勒陀利亚', description: '少年自学编程，12 岁卖出首款游戏 Blastar，埋下极客基因。' },
          { year: '1999', title: '创立 X.com，后并 入 PayPal', description: '用 2800 万美元卖掉 Zip2 后押注在线支付，奠定第一桶金。' },
          { year: '2008', title: 'SpaceX 猎鹰 1 号首次入轨', description: '前三次发射均失败、资金见底，第四次成功逆袭续命航天业。' },
          { year: '2022', title: '440 亿美元收购 Twitter', description: '大规模裁员、改名 X、复活被封账号，把社交平台变成舆论实验场。' },
        ],
      },
      achievements: {
        items: [
          { metric: '$3万亿+', label: '曾触达的个人身家', context: '特斯拉股价高点时登顶全球首富' },
          { metric: '6家', label: '同时在管的公司', context: 'Tesla / SpaceX / X / Neuralink / Boring / xAI' },
          { metric: '5000+', label: 'SpaceX 猎鹰火箭累计发射', context: '可回收复用大幅压低发射成本' },
          { metric: '200万', label: 'Neuralink 已部署电极', context: '脑机接口进入人体临床试验' },
        ],
      },
      darkside: {
        controversies: [
          { title: 'Twitter 收购引发的治理混乱', detail: '裁员过半、广告主流失、蓝V收费反复，平台估值一度缩水过半。', severity: 'high' },
          { title: '直播打游戏级别的口无遮拦', detail: '影响股价的推文引来 SEC 调查，多次被指操纵市场。', severity: 'medium' },
          { title: '"硬核"企业文化', detail: '要求员工睡工厂、996 成常态，离职率居高不下，被批压榨人力。', severity: 'medium' },
        ],
      },
      gameplay: {
        stakeholders: [
          { name: '监管方 SEC/FDA/FAA', position: '裁判', interest: '守住市场、医疗、航空安全底线，频繁约谈' },
          { name: '散户与机构投资者', position: '燃料', interest: '在叙事与估值之间博弈，情绪化追涨杀跌' },
          { name: '传统车企与航天巨头', position: '对手', interest: '保住燃油车与发射市场份额，联合游说施压' },
        ],
        dynamics: '马斯克的护城河不在技术本身，而在"叙事-融资-兑现"的飞轮：用愿景拉估值，用估值融钱，再用钱兑现承诺，循环加杠杆。',
        relations: [
          { from: '监管方 SEC/FDA/FAA', to: '传统车企与航天巨头', relation: '监管' },
          { from: '传统车企与航天巨头', to: '散户与机构投资者', relation: '竞争' },
          { from: '散户与机构投资者', to: '监管方 SEC/FDA/FAA', relation: '依赖' },
        ],
      },
      trends: {
        trends: [
          { label: 'Tesla 年度交付量(万辆)', points: [{ x: '2018', y: 24.5 }, { x: '2019', y: 36.7 }, { x: '2020', y: 49.9 }, { x: '2021', y: 93.6 }, { x: '2022', y: 131.4 }, { x: '2023', y: 180.8 }] },
          { label: 'SpaceX 年度发射次数', points: [{ x: '2018', y: 21 }, { x: '2019', y: 13 }, { x: '2020', y: 26 }, { x: '2021', y: 31 }, { x: '2022', y: 61 }, { x: '2023', y: 98 }] },
        ],
      },
    },
  },

  乔布斯: {
    entityType: 'HUMAN',
    profile: {
      verdict: {
        title: '把科技翻译成艺术的产品暴君',
        subtitle: '苹果帝国的灵魂人物，用偏执和品味重塑了个人计算、音乐与手机',
        tags: ['产品暴君', '极简主义', '现实扭曲力场', '设计驱动', '传奇离世'],
      },
      timeline: {
        events: [
          { year: '1976', title: '在车库创立苹果', description: '与沃兹尼亚克在父母车库组装 Apple I，开启个人电脑时代。' },
          { year: '1985', title: '被自己创办的公司扫地出门', description: '与董事会及 CEO 决裂，离开苹果创立 NeXT，蛰伏十二年。' },
          { year: '1997', title: '回归濒死的苹果', description: '苹果收购 NeXT，乔布斯以 iCEO 身份归来，砍掉 70% 产品线。' },
          { year: '2007', title: '发布初代 iPhone', description: '用多点触控干掉键盘，重新定义手机，开启移动互联网十年。' },
        ],
      },
      achievements: {
        items: [
          { metric: '3次', label: '改变世界的品类', context: '个人电脑 / 数字音乐 / 智能手机' },
          { metric: '$3万亿', label: '苹果公司峰值市值', context: '成为全球市值最高的公司之一' },
          { metric: '4款', label: 'i 系列爆款', context: 'iMac / iPod / iPhone / iPad' },
          { metric: '345项', label: '署名核心专利', context: '从包装盒到系统交互均有覆盖' },
        ],
      },
      darkside: {
        controversies: [
          { title: '否认亲生女儿', detail: '早年拒绝承认女儿 Lisa，甚至曾在法庭上谎称自己不育。', severity: 'high' },
          { title: '产品暴君式管理', detail: '对下属极尽羞辱，"现实扭曲力场"既是魔力也是PUA。', severity: 'medium' },
          { title: '囤积期权倒签丑闻', detail: '曾被卷入期权倒签事件，公司内部调查虽未追责但声誉受损。', severity: 'low' },
        ],
      },
      gameplay: {
        stakeholders: [
          { name: '设计师团队', position: '执行', interest: '在暴君式压力下被逼出代表作' },
          { name: '供应链与代工方', position: '下游', interest: '被极限压价、要求极致工艺' },
          { name: '竞争对手微软/谷歌', position: '对手', interest: '用开放生态对抗苹果封闭体验' },
        ],
        dynamics: '乔布斯的底层逻辑是"站在科技与人文的十字路口"：用闭环体验和极致取舍，让产品成为信仰，让用户为身份认同而非参数买单。',
        relations: [
          { from: '设计师团队', to: '供应链与代工方', relation: '依赖' },
          { from: '竞争对手微软/谷歌', to: '设计师团队', relation: '对立' },
          { from: '供应链与代工方', to: '竞争对手微软/谷歌', relation: '竞争' },
        ],
      },
      trends: {
        trends: [
          { label: '苹果年营收(亿美元)', points: [{ x: '2001', y: 53 }, { x: '2005', y: 139 }, { x: '2007', y: 246 }, { x: '2010', y: 652 }, { x: '2011', y: 1082 }] },
          { label: 'iPod 累计销量(百万台)', points: [{ x: '2002', y: 0.4 }, { x: '2004', y: 10 }, { x: '2006', y: 88 }, { x: '2008', y: 174 }, { x: '2010', y: 275 }] },
        ],
      },
    },
  },

  比特币: {
    entityType: 'ITEM',
    profile: {
      verdict: {
        title: '一种靠共识续命的数字黄金',
        subtitle: '中本聪创造的点对点电子现金，从极客玩具演变为机构资产',
        tags: ['去中心化', '抗审查', '高波动', '数字黄金', '2100万上限'],
      },
      timeline: {
        events: [
          { year: '2008', title: '中本聪发布白皮书', description: '《比特币：一种点对点电子现金系统》在密码学邮件列表问世。' },
          { year: '2010', title: '比特币披萨日', description: '程序员用 1 万 BTC 换了两张披萨，第一次给比特币定价。' },
          { year: '2017', title: '首次冲上 2 万美元', description: 'ICO 狂热推动牛市，随后崩跌 80%，进入加密寒冬。' },
          { year: '2024', title: '现货 ETF 获批 + 减半', description: '机构资金通过合规通道涌入，第四次减半后供给进一步收紧。' },
        ],
      },
      achievements: {
        items: [
          { metric: '2100万枚', label: '总量硬上限', context: '通过算法通缩抗通胀，被称数字黄金' },
          { metric: '$7万+', label: '单枚价格峰值', context: '2024 年现货 ETF 获批后创历史新高' },
          { metric: '7000+', label: '全球可交易节点', context: '遍布六大洲的完整节点维持网络共识' },
          { metric: '19次', label: '最高"死亡"次数', context: '主流媒体已宣告其"死亡"上百次仍存活' },
        ],
      },
      darkside: {
        controversies: [
          { title: '巨量能源消耗', detail: 'PoW 挖矿年耗电量一度超过中型国家，被指加剧碳排放。', severity: 'high' },
          { title: '洗钱与暗网温床', detail: '丝绸之路、勒索软件长期以比特币结算，监管紧盯。', severity: 'high' },
          { title: '剧烈波动与爆仓', detail: '数倍涨跌家常便饭，杠杆玩家频繁爆仓血本无归。', severity: 'medium' },
        ],
      },
      gameplay: {
        stakeholders: [
          { name: '矿工与矿池', position: '生产者', interest: '争夺出块奖励与手续费，电费即成本' },
          { name: '机构与 ETF 资金', position: '增量燃料', interest: '用合规通道把比特币纳入资产配置' },
          { name: '各国监管', position: '裁判', interest: '在创新与金融稳定、反洗钱之间反复拉扯' },
        ],
        dynamics: '比特币的底层逻辑是"用算力换信任"：把对中心化机构的信任，转化为对数学与共识的信任，稀缺性叙事是价格的锚。',
        relations: [
          { from: '各国监管', to: '矿工与矿池', relation: '监管' },
          { from: '矿工与矿池', to: '机构与 ETF 资金', relation: '依赖' },
          { from: '机构与 ETF 资金', to: '各国监管', relation: '对立' },
        ],
      },
      trends: {
        trends: [
          { label: 'BTC 年末价格(美元)', points: [{ x: '2017', y: 14156 }, { x: '2018', y: 3742 }, { x: '2019', y: 7194 }, { x: '2020', y: 28949 }, { x: '2021', y: 46306 }, { x: '2022', y: 16547 }, { x: '2023', y: 42258 }] },
        ],
      },
    },
  },

  iphone: {
    entityType: 'ITEM',
    profile: {
      verdict: {
        title: '重新定义手机的工业艺术品',
        subtitle: '多点触控干掉键盘，开启移动互联网十年红利',
        tags: ['多点触控', 'App生态', '高端旗舰', '设计驱动', '闭环体验'],
      },
      timeline: {
        events: [
          { year: '2007', title: '初代 iPhone 发布', description: '乔布斯用一台没有键盘的手机震惊世界，被称为"上帝手机"。' },
          { year: '2008', title: 'App Store 上线', description: '第三方应用生态爆发，从此手机取代 PC 成第一计算入口。' },
          { year: '2014', title: 'iPhone 6 转向大屏', description: '4.7/5.5 寸大屏一战封神，奠定后续多年销量神话。' },
          { year: '2023', title: 'USB-C 替代 Lightning', description: '欧盟监管倒逼换接口，iPhone 15 正式告别专属接口。' },
        ],
      },
      achievements: {
        items: [
          { metric: '23亿+', label: '全球累计销量', context: '自 2007 年以来累计出货量' },
          { metric: '$2000亿', label: '年营收量级', context: 'iPhone 单品营收长期占苹果半壁江山' },
          { metric: '180万+', label: 'App Store 应用数', context: '全球最大移动应用分发平台' },
          { metric: '90%+', label: '高端市场份额', context: '在 600 美元以上机型中长期垄断' },
        ],
      },
      darkside: {
        controversies: [
          { title: '价格逐年攀升', detail: 'Pro Max 顶配破万元成常态，被讽"理财手机"。', severity: 'medium' },
          { title: '创新挤牙膏', detail: '近年迭代多为影像与芯片微调，被批"换壳再卖"。', severity: 'medium' },
          { title: '生态封闭与"苹果税"', detail: '30% 抽成与支付限制引发全球反垄断围攻。', severity: 'high' },
        ],
      },
      gameplay: {
        stakeholders: [
          { name: '苹果自身', position: '平台方', interest: '通过硬件+系统+商店闭环锁住用户与利润' },
          { name: '开发者', position: '内容供给', interest: '在庞大流量与高昂抽成间做权衡' },
          { name: '安卓阵营', position: '对手', interest: '用开放与性价比争夺中低端与新兴市场' },
        ],
        dynamics: 'iPhone 的底层逻辑是"用硬件做入口、用生态做护城河"：单品利润率行业第一，闭环体验把用户锁在苹果宇宙里持续变现。',
        relations: [
          { from: '苹果自身', to: '开发者', relation: '监管' },
          { from: '开发者', to: '安卓阵营', relation: '竞争' },
          { from: '安卓阵营', to: '苹果自身', relation: '对立' },
        ],
      },
      trends: {
        trends: [
          { label: 'iPhone 年度出货量(百万台)', points: [{ x: '2014', y: 192 }, { x: '2015', y: 231 }, { x: '2016', y: 211 }, { x: '2018', y: 209 }, { x: '2020', y: 206 }, { x: '2021', y: 235 }, { x: '2023', y: 228 }] },
          { label: '苹果年营收(十亿美元)', points: [{ x: '2015', y: 233 }, { x: '2017', y: 229 }, { x: '2019', y: 260 }, { x: '2021', y: 365 }, { x: '2023', y: 383 }] },
        ],
      },
    },
  },

  金融危机: {
    entityType: 'EVENT',
    profile: {
      verdict: {
        title: '一次杠杆狂欢后的系统性清算',
        subtitle: '次贷崩塌引发的全球流动性危机，重塑了金融监管与央行角色',
        tags: ['次贷', '系统性风险', '去杠杆', '救市', '大而不能倒'],
      },
      timeline: {
        events: [
          { year: '2007', title: '次贷违约潮浮现', description: '美国次级按揭大规模违约，新世纪金融破产，危机初露端倪。' },
          { year: '2008.9', title: '雷曼兄弟倒闭', description: '158 年老牌投行倒下，货币市场冻结，全球股市崩盘。' },
          { year: '2008.10', title: '全球协同救市', description: '美联储 QE、TARP 7000 亿注资、各国央行同步降息托底。' },
          { year: '2010', title: ' Dodd-Frank 法案落地', description: '沃克尔规则、压力测试登场，金融监管进入强约束时代。' },
        ],
      },
      achievements: {
        items: [
          { metric: '$22万亿', label: '全球股市蒸发市值', context: '2008 年全球股市一年内缩水近半' },
          { metric: '4万亿美元', label: '美联储 QE 规模', context: '三轮量化宽松重塑资产负债表' },
          { metric: '500+', label: '倒闭美国银行', context: '2008-2012 年间被 FDIC 接管的银行数' },
          { metric: '8.7%', label: '美国峰值失业率', context: '2009 年 10 月触及危机后最高点' },
        ],
      },
      darkside: {
        controversies: [
          { title: '"大而不能倒"的道德风险', detail: '救助华尔街却让纳税人买单，主事者鲜被追责。', severity: 'high' },
          { title: '评级机构集体失灵', detail: 'AAA 评级给垃圾次贷，事后仅被罚款了事。', severity: 'high' },
          { title: '贫富分化加剧', detail: '救市推高资产价格，有钱人先回血，普通人长期失业。', severity: 'medium' },
        ],
      },
      gameplay: {
        stakeholders: [
          { name: '投行与商业银行', position: '肇事者+受益者', interest: '高风险赚钱、出事要救市' },
          { name: '美联储与各国央行', position: '最后贷款人', interest: '稳流动性、防通缩，承受通胀副作用' },
          { name: '普通纳税人', position: '买单者', interest: '承担失业与房价下跌，却极少获补偿' },
        ],
        dynamics: '危机的底层逻辑是"私人收益、社会化损失"：杠杆上行时利润归资本，崩盘时成本由全民承担，监管一直在追着创新跑。',
        relations: [
          { from: '美联储与各国央行', to: '投行与商业银行', relation: '监管' },
          { from: '投行与商业银行', to: '普通纳税人', relation: '依赖' },
          { from: '普通纳税人', to: '美联储与各国央行', relation: '依赖' },
        ],
      },
      trends: {
        trends: [
          { label: '美国失业率(%)', points: [{ x: '2007', y: 4.6 }, { x: '2008', y: 5.8 }, { x: '2009', y: 9.3 }, { x: '2010', y: 9.6 }, { x: '2011', y: 8.9 }, { x: '2012', y: 8.1 }, { x: '2013', y: 7.4 }] },
          { label: '美联储基准利率(%)', points: [{ x: '2006', y: 5.24 }, { x: '2007', y: 5.02 }, { x: '2008', y: 1.92 }, { x: '2009', y: 0.16 }, { x: '2010', y: 0.18 }, { x: '2011', y: 0.1 }] },
        ],
      },
    },
  },

  世界杯: {
    entityType: 'EVENT',
    profile: {
      verdict: {
        title: '每四年点燃一次的全球狂欢',
        subtitle: '国家荣誉与商业资本共舞的超级体育 IP',
        tags: ['体育IP', '国家荣誉', '商业盛宴', '四年一届', '全球直播'],
      },
      timeline: {
        events: [
          { year: '1930', title: '首届乌拉圭世界杯', description: '13 支队伍参赛，乌拉圭本土夺冠，揭开世界杯百年序章。' },
          { year: '1970', title: '彩色电视时代的墨西哥', description: '首次全球卫星直播、首次彩色转播，世界杯成为全球现象。' },
          { year: '2022', title: '卡塔尔冬季世界杯', description: '首次冬季举办、首个中东东道主，阿根廷梅西圆梦封王。' },
          { year: '2026', title: '美加墨三国联办', description: '首次由三国联合主办、扩军至 48 队，赛制大改。' },
        ],
      },
      achievements: {
        items: [
          { metric: '50亿+', label: '累计观众人次', context: '2022 决赛全球约 15 亿人观看' },
          { metric: '$75亿', label: '单届商业收入', context: 'FIFA 一届周期营收量级' },
          { metric: '48支', label: '2026 参赛队伍', context: '从 32 队扩军为 48 队' },
          { metric: '22届', label: '已举办届数', context: '仅 8 个国家曾捧起大力神杯' },
        ],
      },
      darkside: {
        controversies: [
          { title: '东道主申办腐败', detail: '2018/2022 申办过程深陷行贿丑闻，多名 FIFA 高管落马。', severity: 'high' },
          { title: '场馆建设劳工问题', detail: '卡塔尔被指剥削外籍劳工，疑有数千工人伤亡。', severity: 'high' },
          { title: '赛事泡沫与白象球场', detail: '巨额场馆赛后闲置，东道主财政与税收承压。', severity: 'medium' },
        ],
      },
      gameplay: {
        stakeholders: [
          { name: 'FIFA', position: '操盘者', interest: '最大化转播与赞助收入，维持垄断地位' },
          { name: '东道主国家', position: '承销商', interest: '提升国家形象、拉动旅游，承受场馆成本' },
          { name: '赞助商与转播商', position: '金主', interest: '借全球流量做品牌曝光与会员变现' },
        ],
        dynamics: '世界杯的底层逻辑是"国家荣誉变现"：把爱国主义情绪包装成可售卖的注意力，FIFA 坐收渔利，足球成了最赚钱的四年一遇生意。',
        relations: [
          { from: 'FIFA', to: '东道主国家', relation: '监管' },
          { from: '东道主国家', to: '赞助商与转播商', relation: '依赖' },
          { from: '赞助商与转播商', to: 'FIFA', relation: '依赖' },
        ],
      },
      trends: {
        trends: [
          { label: 'FIFA 单届营收(亿美元)', points: [{ x: '2006', y: 26 }, { x: '2010', y: 39 }, { x: '2014', y: 48 }, { x: '2018', y: 53 }, { x: '2022', y: 75 }] },
          { label: '决赛全球观众(亿人)', points: [{ x: '2006', y: 7.15 }, { x: '2010', y: 9.07 }, { x: '2014', y: 10.7 }, { x: '2018', y: 11.2 }, { x: '2022', y: 15 }] },
        ],
      },
    },
  },
}

// ============== 通用回退生成器（基于查询关键词动态拼装） ==============

function pickByEntity<T>(entityType: EntityType, human: T, event: T, item: T): T {
  switch (entityType) {
    case 'HUMAN':
      return human
    case 'EVENT':
      return event
    case 'ITEM':
      return item
  }
}

function buildGenericVerdict(query: string, entityType: EntityType): VerdictCardData {
  const subject = query.trim() || '该对象'
  const title = pickByEntity(
    entityType,
    `一位值得拆开来看的复杂人物：${subject}`,
    `一场正在被反复解读的事件：${subject}`,
    `一个被持续关注的产品/技术：${subject}`,
  )
  const subtitle = pickByEntity(
    entityType,
    '其成就与争议同样显著，需要多维度交叉验证',
    '其影响穿越当下，仍在塑造后续格局',
    '其技术路径与商业逻辑值得深挖',
  )
  const tags = pickByEntity<string[]>(
    entityType,
    ['复杂人物', '争议焦点', '高曝光度', '多重身份'],
    ['关键事件', '深远影响', '多方博弈', '仍在演进'],
    ['关注焦点', '技术/产品', '市场敏感', '快速迭代'],
  )
  return { title, subtitle, tags }
}

function buildGenericTimeline(query: string, entityType: EntityType): TimelineCardData {
  const subject = query.trim() || '其'
  const events = pickByEntity(
    entityType,
    [
      { year: '早期', title: `${subject}的起步阶段`, description: '在资源有限的条件下完成原始积累，确立核心方向。' },
      { year: '转折', title: '关键抉择与破局', description: '做出一次高风险决策，押注日后被验证的关键路径。' },
      { year: '巅峰', title: '迎来高光时刻', description: '获得行业级认可，影响力快速外溢到大众视野。' },
      { year: '当下', title: '进入新阶段', description: '面对新挑战与转型压力，叙事仍在续写。' },
    ],
    [
      { year: '酝酿期', title: `${subject}的伏笔`, description: '结构性矛盾长期积累，被多数人低估。' },
      { year: '爆发点', title: '导火索被点燃', description: '一次外部冲击引爆全局，迅速演化为危机/热潮。' },
      { year: '蔓延期', title: '影响扩散', description: '跨市场、跨区域传导，监管与市场紧急应对。' },
      { year: '余波', title: '格局重塑', description: '事后规则重写，行业生态被永久改变。' },
    ],
    [
      { year: '诞生', title: `${subject}的问世`, description: '以差异化定位切入市场，初步验证需求。' },
      { year: '迭代', title: '关键版本突破', description: '一次重要更新解决核心痛点，用户量级跃升。' },
      { year: '扩张', title: '生态与规模双爆发', description: '形成网络效应，开始定义品类标准。' },
      { year: '当下', title: '进入竞争深水区', description: '面对模仿者与监管，寻找第二曲线。' },
    ],
  )
  return { events }
}

function buildGenericAchievements(query: string, entityType: EntityType): AchievementsCardData {
  const subject = query.trim() || '该对象'
  const items = pickByEntity(
    entityType,
    [
      { metric: 'TOP 1%', label: '所在赛道头部位置', context: `${subject}长期处于行业第一梯队` },
      { metric: '20年+', label: '行业活跃年限', context: '穿越多个周期仍保持影响力' },
      { metric: '多次', label: '关键转型成功', context: '在不同赛道完成跨界跃迁' },
      { metric: '百万级', label: '直接受影响人群', context: '其决策波及产业链上下游' },
    ],
    [
      { metric: '全球级', label: '影响范围', context: `${subject}影响跨越多个市场` },
      { metric: '数年', label: '持续周期', context: '影响持续多个季度甚至更久' },
      { metric: '万亿级', label: '牵涉资金规模', context: '引发资产价格剧烈重定价' },
      { metric: '多项', label: '规则被改写', context: '事后监管与行业规则发生根本调整' },
    ],
    [
      { metric: '千万级', label: '用户/出货量级', context: `${subject}触达用户规模可观` },
      { metric: '市占领先', label: '细分市场地位', context: '在核心品类占据头部份额' },
      { metric: '多轮', label: '融资/迭代次数', context: '获得资本与市场持续加注' },
      { metric: '高复购', label: '用户黏性指标', context: '形成稳定的使用习惯与口碑' },
    ],
  )
  return { items }
}

function buildGenericDarkside(query: string, entityType: EntityType): DarksideCardData {
  const subject = query.trim() || '该对象'
  const controversies = pickByEntity(
    entityType,
    [
      { title: '高曝光下的言行争议', detail: `${subject}的公开表态多次引发舆论反噬，被指消费公众情绪。`, severity: 'medium' as const },
      { title: '利益关联的灰色地带', detail: '与多方资本/权力存在复杂关联，独立性屡被质疑。', severity: 'high' as const },
      { title: '过度透支个人信用', detail: '长期以个人 IP 兑现承诺，兑现率被打上问号。', severity: 'low' as const },
    ],
    [
      { title: '信息不对称下的误判', detail: `${subject}在爆发初期被广泛误读，错过最佳应对窗口。`, severity: 'high' as const },
      { title: '代价由弱势方承担', detail: '危机成本最终转嫁给普通参与者，救济机制缺位。', severity: 'high' as const },
      { title: '事后追责流于形式', detail: '主要责任方鲜被实质惩罚，埋下重复风险。', severity: 'medium' as const },
    ],
    [
      { title: '宣传与兑现存在落差', detail: `${subject}的营销承诺高于实际体验，引发用户维权。`, severity: 'medium' as const },
      { title: '数据与隐私边界模糊', detail: '在数据采集与使用上屡被监管点名。', severity: 'high' as const },
      { title: '商业模式可持续性存疑', detail: '靠补贴或叙事驱动增长，盈利模型尚未跑通。', severity: 'medium' as const },
    ],
  )
  return { controversies }
}

function buildGenericGameplay(query: string, entityType: EntityType): GameplayCardData {
  const subject = query.trim() || '该对象'
  const stakeholders = pickByEntity(
    entityType,
    [
      { name: '核心当事人', position: '主角', interest: `${subject}本人掌握叙事与决策主导权` },
      { name: '资本与机构', position: '燃料', interest: '提供资源并期望回报，关键时刻施压' },
      { name: '监管与公众', position: '裁判', interest: '在创新与秩序之间反复博弈' },
    ],
    [
      { name: '核心利益方', position: '主导', interest: `${subject}中掌握关键资源与规则制定权` },
      { name: '被动参与者', position: '承受者', interest: '承担风险却少有话语权' },
      { name: '监管与救市方', position: '裁判', interest: '在稳定与创新间平衡，常事后补救' },
    ],
    [
      { name: '产品/技术方', position: '操盘', interest: `${subject}背后定义品类与体验标准` },
      { name: '用户与客户', position: '买方', interest: '用脚投票，追求性价比与体验' },
      { name: '竞争对手', position: '对手', interest: '争夺份额与生态主导权' },
    ],
  )
  const dynamics = pickByEntity(
    entityType,
    `${subject}的底层逻辑是"个人 IP + 资源杠杆"：用个人信用撬动资源，再用资源兑现承诺，循环放大影响力。`,
    `${subject}的底层逻辑是"风险传导与利益分配"：上行期收益私有化，下行期成本社会化，规则总在事后才补上。`,
    `${subject}的底层逻辑是"用先发优势建生态护城河"：靠体验锁住用户，再通过数据和生态变现锁定长期价值。`,
  )
  return { stakeholders, dynamics }
}

function buildGenericTrends(query: string, entityType: EntityType): TrendCardData {
  const subject = query.trim() || '该对象'
  const trends = pickByEntity<TrendCardData['trends']>(
    entityType,
    [
      { label: `${subject} 影响力指数`, points: [{ x: '早期', y: 20 }, { x: '成长期', y: 45 }, { x: '巅峰', y: 85 }, { x: '当下', y: 70 }] },
    ],
    [
      { label: `${subject} 关注度指数`, points: [{ x: '酝酿期', y: 15 }, { x: '爆发', y: 90 }, { x: '蔓延', y: 75 }, { x: '余波', y: 40 }] },
    ],
    [
      { label: `${subject} 市场渗透率(%)`, points: [{ x: '诞生', y: 2 }, { x: '迭代', y: 12 }, { x: '扩张', y: 38 }, { x: '当下', y: 55 }] },
    ],
  )
  return { trends }
}

function buildGenericProfile(query: string, entityType: EntityType): EntityProfile {
  return {
    verdict: buildGenericVerdict(query, entityType),
    timeline: buildGenericTimeline(query, entityType),
    achievements: buildGenericAchievements(query, entityType),
    darkside: buildGenericDarkside(query, entityType),
    gameplay: buildGenericGameplay(query, entityType),
    trends: buildGenericTrends(query, entityType),
  }
}

// ============== 主入口 ==============

function resolveProfile(query: string, entityType: EntityType): EntityProfile {
  const q = query.toLowerCase().trim()
  // 精确匹配知识库（按 key 包含关系）
  for (const key of Object.keys(KNOWLEDGE_BASE)) {
    const entry = KNOWLEDGE_BASE[key]
    if (entry.entityType === entityType && q.includes(key.toLowerCase())) {
      return entry.profile
    }
  }
  // 兜底：动态拼装
  return buildGenericProfile(query, entityType)
}

/**
 * 生成情报卡片
 * @returns { cards: 5 张卡片的数组, sources: 数据源列表（mock 模式为空）, images: 图片 URL 列表（mock 不产生图片） }
 */
export async function generateIntelCards(
  query: string,
  entityType: EntityType,
): Promise<{ cards: IntelCard[]; sources: IntelSource[]; images: string[] }> {
  // 模拟推理延迟（不在此处控制流式间隔，仅模拟生成耗时）
  await new Promise((resolve) => setTimeout(resolve, 100))

  const profile = resolveProfile(query, entityType)

  const cards: IntelCard[] = [
    { cardType: 'verdict', payload: profile.verdict },
    { cardType: 'timeline', payload: profile.timeline },
    { cardType: 'achievements', payload: profile.achievements },
    { cardType: 'trends', payload: profile.trends },
    { cardType: 'darkside', payload: profile.darkside },
    { cardType: 'gameplay', payload: profile.gameplay },
  ]

  return { cards, sources: [], images: [] }
}
