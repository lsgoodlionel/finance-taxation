<map version="1.0.1">
<node TEXT="V16 六角色操作实验">
  <node TEXT="目标" POSITION="right">
    <node TEXT="开发者测试答不了的问题">
      <node TEXT="真人能不能把活干完"/>
      <node TEXT="入口找不找得到"/>
      <node TEXT="业务上合不合理"/>
    </node>
    <node TEXT="四个验证角度">
      <node TEXT="操作便捷性"/>
      <node TEXT="逻辑正确性"/>
      <node TEXT="业务合理性"/>
      <node TEXT="功能完整性"/>
    </node>
  </node>
  <node TEXT="方法" POSITION="right">
    <node TEXT="按角色而非按模块">
      <node TEXT="模块测沿代码结构走"/>
      <node TEXT="角色测横穿模块"/>
      <node TEXT="缺陷在模块之间的缝隙"/>
    </node>
    <node TEXT="两条腿走路">
      <node TEXT="API 层：业务逻辑与数据"/>
      <node TEXT="页面层：这件事点不点得到"/>
    </node>
    <node TEXT="纪律">
      <node TEXT="不 reset 库 / 不锁会计期间"/>
      <node TEXT="自造数据带角色前缀"/>
      <node TEXT="不许编，每条要证据"/>
    </node>
  </node>
  <node TEXT="六个角色与各自撞到的缺陷" POSITION="right">
    <node TEXT="董事长（决策层）23 条 / 阻断 2">
      <node TEXT="首页点一次批准 → 两张等额凭证" COLOR="#d92626"/>
      <node TEXT="零现金却说「资金充裕」" COLOR="#d92626"/>
    </node>
    <node TEXT="财务负责人（管理层）30 条 / 阻断 6">
      <node TEXT="前台无法过账任何凭证" COLOR="#d92626"/>
      <node TEXT="资料包导出 9 种全 500" COLOR="#d92626"/>
    </node>
    <node TEXT="会计（执行层）25 条 / 阻断 5">
      <node TEXT="凭证会计日期被改写成今天" COLOR="#d92626"/>
      <node TEXT="红冲按钮是死代码" COLOR="#d92626"/>
    </node>
    <node TEXT="出纳（执行层）23 条 / 阻断 6">
      <node TEXT="一笔款能付两次" COLOR="#d92626"/>
      <node TEXT="并发重试不幂等" COLOR="#d92626"/>
    </node>
    <node TEXT="税务专员（专业层）22 条 / 阻断 5">
      <node TEXT="增值税底稿税额是 NaN" COLOR="#d92626"/>
      <node TEXT="三个申报 CSV 全 500" COLOR="#d92626"/>
    </node>
    <node TEXT="业务员工（末端）21 条 / 阻断 4">
      <node TEXT="能自批自付自己的报销单" COLOR="#d92626"/>
      <node TEXT="能读写别人的报销单" COLOR="#d92626"/>
    </node>
  </node>
  <node TEXT="结果：144 条发现，28 条阻断" POSITION="right">
    <node TEXT="多角色独立撞到（可信度最高）">
      <node TEXT="无事项凭证过不了账：财务负责人 + 会计"/>
      <node TEXT="职责分离可绕过：财务负责人 + 员工 + 出纳"/>
      <node TEXT="会计日期串期：财务负责人 + 会计"/>
    </node>
    <node TEXT="已修 8 条（配测试 + 反向验证）">
      <node TEXT="重复凭证：按 mapping_id 查重" COLOR="#16a34a"/>
      <node TEXT="会计日期：两处 insert 补字段" COLOR="#16a34a"/>
      <node TEXT="无事项凭证：放开两张表的约束" COLOR="#16a34a"/>
      <node TEXT="零现金：全零返回 null 而非 true" COLOR="#16a34a"/>
      <node TEXT="超付：额度按已付 + 在途算" COLOR="#16a34a"/>
      <node TEXT="自批自付：审批人 ≠ 申请人" COLOR="#16a34a"/>
      <node TEXT="申报 CSV：表名写错一处" COLOR="#16a34a"/>
      <node TEXT="资料包：date 少了 ::text" COLOR="#16a34a"/>
    </node>
    <node TEXT="已确认未修 8 类">
      <node TEXT="增值税 NaN：要拆数据模型"/>
      <node TEXT="前台过账：要加终审人选择器"/>
      <node TEXT="审批流没接进业务单据"/>
      <node TEXT="403 被渲染成「没有数据」"/>
    </node>
  </node>
  <node TEXT="揭示的深层问题" POSITION="right">
    <node TEXT="符号存在 ≠ 按钮可见">
      <node TEXT="我自己补的红冲入口同样不存在"/>
      <node TEXT="tsc 绿、单测绿、护栏也绿"/>
    </node>
    <node TEXT="前台入口护栏的第三个洞">
      <node TEXT="① 前缀过宽（V15 已修）"/>
      <node TEXT="② 末段被同名路径遮蔽"/>
      <node TEXT="③ API client 天然含所有 URL"/>
    </node>
    <node TEXT="测试沿着最顺的那条路走">
      <node TEXT="既有测试都从事项出发建凭证"/>
      <node TEXT="单测喂 basis:1000，生产写政策散文"/>
      <node TEXT="函数签名里没有「操作人」这个概念"/>
    </node>
  </node>
  <node TEXT="我犯的错" POSITION="right">
    <node TEXT="清空了正在被使用的数据库">
      <node TEXT="本轮第三次踩同一个坑"/>
      <node TEXT="报告保住了，证据数据没了"/>
      <node TEXT="集成测试默认 reset，必须先摆明面"/>
    </node>
  </node>
</node>
</map>
