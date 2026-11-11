// Vietnamese banks that receive VietQR transfers, with the 6-digit bank
// identification number (BIN) each code carries in its merchant account
// information (NAPAS VietQR, GUID A000000727).
//
// Source: the public VietQR bank directory, https://api.vietqr.io/v2/banks,
// read on 2026-11-11, keeping the banks with transferSupported = 1. To
// update, fetch that list again and replace the rows (sorted by short name).

export interface VietQrBank {
  /** Bank identification number, 6 digits */
  bin: string;
  /** NAPAS bank code */
  code: string;
  shortName: string;
  name: string;
}

export const VIETQR_BANKS: readonly VietQrBank[] = [
  {
    bin: "970425",
    code: "ABB",
    shortName: "ABBANK",
    name: "Ngân hàng TMCP An Bình",
  },
  {
    bin: "970416",
    code: "ACB",
    shortName: "ACB",
    name: "Ngân hàng TMCP Á Châu",
  },
  {
    bin: "970405",
    code: "VBA",
    shortName: "Agribank",
    name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam",
  },
  {
    bin: "970409",
    code: "BAB",
    shortName: "BacABank",
    name: "Ngân hàng TMCP Bắc Á",
  },
  {
    bin: "970438",
    code: "BVB",
    shortName: "BaoVietBank",
    name: "Ngân hàng TMCP Bảo Việt",
  },
  {
    bin: "970418",
    code: "BIDV",
    shortName: "BIDV",
    name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam",
  },
  {
    bin: "546034",
    code: "CAKE",
    shortName: "CAKE",
    name: "TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank",
  },
  {
    bin: "970444",
    code: "CBB",
    shortName: "CBBank",
    name: "Ngân hàng Thương mại trách nhiệm hữu hạn một thành viên Ngoại thương Công nghệ số (Vietcombank Neo Limited)",
  },
  {
    bin: "422589",
    code: "CIMB",
    shortName: "CIMB",
    name: "Ngân hàng TNHH MTV CIMB Việt Nam",
  },
  {
    bin: "970446",
    code: "COOPBANK",
    shortName: "COOPBANK",
    name: "Ngân hàng Hợp tác xã Việt Nam",
  },
  {
    bin: "970431",
    code: "EIB",
    shortName: "Eximbank",
    name: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam",
  },
  {
    bin: "970437",
    code: "HDB",
    shortName: "HDBank",
    name: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh",
  },
  {
    bin: "970434",
    code: "IVB",
    shortName: "IndovinaBank",
    name: "Ngân hàng TNHH Indovina",
  },
  {
    bin: "668888",
    code: "KBank",
    shortName: "KBank",
    name: "Ngân hàng Đại chúng TNHH Kasikornbank",
  },
  {
    bin: "970452",
    code: "KLB",
    shortName: "KienLongBank",
    name: "Ngân hàng TMCP Kiên Long",
  },
  {
    bin: "970463",
    code: "KBHCM",
    shortName: "KookminHCM",
    name: "Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh",
  },
  {
    bin: "970462",
    code: "KBHN",
    shortName: "KookminHN",
    name: "Ngân hàng Kookmin - Chi nhánh Hà Nội",
  },
  {
    bin: "970449",
    code: "LPB",
    shortName: "LPBank",
    name: "Ngân hàng TMCP Lộc Phát Việt Nam",
  },
  {
    bin: "970422",
    code: "MB",
    shortName: "MBBank",
    name: "Ngân hàng TMCP Quân đội",
  },
  {
    bin: "970414",
    code: "MBV",
    shortName: "MBV",
    name: "Ngân hàng TNHH MTV Việt Nam Hiện Đại",
  },
  {
    bin: "971025",
    code: "momo",
    shortName: "MoMo",
    name: "CTCP Dịch Vụ Di Động Trực Tuyến",
  },
  {
    bin: "970426",
    code: "MSB",
    shortName: "MSB",
    name: "Ngân hàng TMCP Hàng Hải",
  },
  {
    bin: "971032",
    code: "MVAS",
    shortName: "MVAS",
    name: "Trung tâm Dịch vụ số Mobifone – Chi nhánh Tổng Công ty viễn thông Mobifone",
  },
  {
    bin: "970428",
    code: "NAB",
    shortName: "NamABank",
    name: "Ngân hàng TMCP Nam Á",
  },
  {
    bin: "970419",
    code: "NCB",
    shortName: "NCB",
    name: "Ngân hàng TMCP Quốc Dân",
  },
  {
    bin: "970448",
    code: "OCB",
    shortName: "OCB",
    name: "Ngân hàng TMCP Phương Đông",
  },
  {
    bin: "970430",
    code: "PGB",
    shortName: "PGBank",
    name: "Ngân hàng TMCP Thịnh vượng và Phát triển",
  },
  {
    bin: "970412",
    code: "PVCB",
    shortName: "PVcomBank",
    name: "Ngân hàng TMCP Đại Chúng Việt Nam",
  },
  {
    bin: "971133",
    code: "PVDB",
    shortName: "PVcomBank Pay",
    name: "Ngân hàng số PVcomBank",
  },
  {
    bin: "970403",
    code: "STB",
    shortName: "Sacombank",
    name: "Ngân hàng TMCP Sài Gòn Tài Lộc",
  },
  {
    bin: "970400",
    code: "SGICB",
    shortName: "SaigonBank",
    name: "Ngân hàng TMCP Sài Gòn Công Thương",
  },
  {
    bin: "970429",
    code: "SCB",
    shortName: "SCB",
    name: "Ngân hàng TMCP Sài Gòn",
  },
  {
    bin: "970440",
    code: "SEAB",
    shortName: "SeABank",
    name: "Ngân hàng TMCP Đông Nam Á",
  },
  {
    bin: "970443",
    code: "SHB",
    shortName: "SHB",
    name: "Ngân hàng TMCP Sài Gòn - Hà Nội",
  },
  {
    bin: "970424",
    code: "SHBVN",
    shortName: "ShinhanBank",
    name: "Ngân hàng TNHH MTV Shinhan Việt Nam",
  },
  {
    bin: "970407",
    code: "TCB",
    shortName: "Techcombank",
    name: "Ngân hàng TMCP Kỹ thương Việt Nam",
  },
  {
    bin: "963388",
    code: "TIMO",
    shortName: "Timo",
    name: "Ngân hàng số Timo by Ban Viet Bank (Timo by Ban Viet Bank)",
  },
  {
    bin: "970423",
    code: "TPB",
    shortName: "TPBank",
    name: "Ngân hàng TMCP Tiên Phong",
  },
  {
    bin: "546035",
    code: "Ubank",
    shortName: "Ubank",
    name: "TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank",
  },
  {
    bin: "970441",
    code: "VIB",
    shortName: "VIB",
    name: "Ngân hàng TMCP Quốc tế Việt Nam",
  },
  {
    bin: "970427",
    code: "VAB",
    shortName: "VietABank",
    name: "Ngân hàng TMCP Việt Á",
  },
  {
    bin: "970433",
    code: "VIETBANK",
    shortName: "VietBank",
    name: "Ngân hàng TMCP Việt Nam Thương Tín",
  },
  {
    bin: "970454",
    code: "VCCB",
    shortName: "VietCapitalBank",
    name: "Ngân hàng TMCP Bản Việt",
  },
  {
    bin: "970436",
    code: "VCB",
    shortName: "Vietcombank",
    name: "Ngân hàng TMCP Ngoại Thương Việt Nam",
  },
  {
    bin: "970415",
    code: "ICB",
    shortName: "VietinBank",
    name: "Ngân hàng TMCP Công thương Việt Nam",
  },
  {
    bin: "970432",
    code: "VPB",
    shortName: "VPBank",
    name: "Ngân hàng TMCP Việt Nam Thịnh Vượng",
  },
  {
    bin: "970457",
    code: "WVN",
    shortName: "Woori",
    name: "Ngân hàng TNHH MTV Woori Việt Nam",
  },
  {
    bin: "971101",
    code: "ZALOPAY",
    shortName: "ZaloPay",
    name: "Ví điện tử ZaloPay",
  },
];

const BY_BIN = new Map(VIETQR_BANKS.map((bank) => [bank.bin, bank]));

/** The bank with this BIN, if VietQR lists it. */
export function vietQrBank(bin: string | undefined): VietQrBank | undefined {
  return bin ? BY_BIN.get(bin.trim()) : undefined;
}
