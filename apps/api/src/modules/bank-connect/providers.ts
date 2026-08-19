/**
 * 银企直连的银行清单（V14-A）。
 *
 * 这里只是**前台下拉的选项与配置提示**，不代表已经接入——是否接入看
 * `listRegisteredProviders()`。两者分开的原因：用户需要先选好银行、把
 * 证书和协议信息填进去，而适配器实现可以晚一步到位。
 *
 * 证书格式与签名算法按各行公开的企业网银资料填写。**这些是配置提示，
 * 不是协议实现**——真接的时候以银行给的接口文档为准。
 */

export interface BankProviderMeta {
  id: string;
  name: string;
  /** 该行常用的签名算法。国密 SM2 在国内银行里越来越普遍。 */
  defaultSignAlgorithm: "RSA" | "SM2";
  certHint: string;
  docsUrl: string;
}

export const BANK_CONNECT_PROVIDERS: BankProviderMeta[] = [
  {
    id: "mock",
    name: "演示适配器（不连真实银行）",
    defaultSignAlgorithm: "RSA",
    certHint: "填任意非空路径即可。用于在没有银行环境时走通全流程。",
    docsUrl: ""
  },
  {
    id: "icbc",
    name: "中国工商银行",
    defaultSignAlgorithm: "RSA",
    certHint: "工行企业网银 U 盾导出的 PFX 证书路径，需在工行开通「银企互联」。",
    docsUrl: "https://open.icbc.com.cn/"
  },
  {
    id: "ccb",
    name: "中国建设银行",
    defaultSignAlgorithm: "RSA",
    certHint: "建行开放平台的应用证书，需签约对公账户与开放平台。",
    docsUrl: "https://open.ccb.com/"
  },
  {
    id: "cmb",
    name: "招商银行",
    defaultSignAlgorithm: "SM2",
    certHint: "招行 CBS 直联证书，走国密 SM2 签名。",
    docsUrl: "https://open.cmbchina.com/"
  },
  {
    id: "pab",
    name: "平安银行",
    defaultSignAlgorithm: "SM2",
    certHint: "平安橙 e 网企业证书，需在平安开通对公直联。",
    docsUrl: "https://open.pingan.com/"
  }
];
