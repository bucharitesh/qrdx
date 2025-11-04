import type { CornerEyePattern } from "../types/corner-eye";

// Pattern 1: Basic square corners
function generateCornerSquarePattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(5, offsetY)}v ${70 * scale}h ${70 * scale}v -${70 * scale}zM ${transform(15, offsetX)} ${transform(15, offsetY)}h ${50 * scale}v ${50 * scale}h -${50 * scale}z`;

  return path;
}

// Pattern 2: Rounded corners
function generateCornerRoundedPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  // Using the exact path from user's specification - rounded square corners
  const path = `M ${transform(5, offsetX)} ${transform(15, offsetY)}v ${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, ${10 * scale} ${10 * scale}h ${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, ${10 * scale} -${10 * scale}v -${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, -${10 * scale} -${10 * scale}h -${50 * scale}a ${10 * scale} ${10 * scale}, 0, 0, 0, -${10 * scale} ${10 * scale}zM ${transform(20, offsetX)} ${transform(15, offsetY)}h ${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, ${5 * scale} ${5 * scale}v ${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, -${5 * scale} ${5 * scale}h -${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, -${5 * scale} -${5 * scale}v -${40 * scale}a ${5 * scale} ${5 * scale}, 0, 0, 1, ${5 * scale} -${5 * scale}z`;

  return path;
}

// Pattern 3: Rounded inward
function generateCornerRoundedInwardPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 45v -45a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} ${25 * scale}M ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 35h -35a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} -${15 * scale}`;

  return path;
}

// Pattern 4: Rounded inward flipped
function generateCornerRoundedInwardFlippedPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 45v -45a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} ${25 * scale}M ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 35h -35a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} -${15 * scale}`;

  return path;
}

// Pattern 6: Semi-round
function generateCornerSemiRoundPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 45v -45a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20H ${transform(5, offsetX)}zM ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 35h -35a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -35z`;

  return path;
}

// Pattern 7: Rounded-extra
function generateCornerRoundedExtraPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(30, offsetY)}v 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} ${25 * scale}h 20a ${25 * scale} ${25 * scale}, 0, 0, 0, ${25 * scale} -${25 * scale}v -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} -${25 * scale}h -20a ${25 * scale} ${25 * scale}, 0, 0, 0, -${25 * scale} ${25 * scale}M ${transform(30, offsetX)} ${transform(15, offsetY)}h 20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} ${15 * scale}v 20a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} ${15 * scale}h -20a ${15 * scale} ${15 * scale}, 0, 0, 1, -${15 * scale} -${15 * scale}v -20a ${15 * scale} ${15 * scale}, 0, 0, 1, ${15 * scale} -${15 * scale}`;

  return path;
}

// Pattern 8: Rounded-square
function generateCornerRoundedSquarePattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  const path = `M ${transform(5, offsetX)} ${transform(40, offsetY)}a ${35 * scale} ${35 * scale}, 0, 0, 0, ${35 * scale} ${35 * scale}h 30a ${5 * scale} ${5 * scale}, 0, 0, 0, ${5 * scale} -${5 * scale}v -30a ${35 * scale} ${35 * scale}, 0, 0, 0, -${35 * scale} -${35 * scale}a ${35 * scale} ${35 * scale}, 0, 0, 0, -${35 * scale} ${35 * scale}zM ${transform(40, offsetX)} ${transform(15, offsetY)}a ${25 * scale} ${25 * scale}, 0, 0, 1, ${25 * scale} ${25 * scale}v 25h -25a ${25 * scale} ${25 * scale}, 0, 0, 1, -${25 * scale} -${25 * scale}a ${25 * scale} ${25 * scale}, 0, 0, 1, ${25 * scale} -${25 * scale}z`;

  return path;
}

// Pattern 9: Circle
function generateCornerCirclePattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  const scale = size / 80;
  const transform = (coord: number, offset: number) => coord * scale + offset;

  // Using the exact path from user's specification - proper circles (made slightly bigger)
  const outerRadius = 37.5 * scale; // Increased from 35
  const innerRadius = 27 * scale; // Increased from 25
  const path = `M ${transform(40, offsetX)} ${transform(2.5, offsetY)}a ${outerRadius} ${outerRadius} 0 1 0 ${0.1 * scale} 0zm 0 ${10.5 * scale}a ${innerRadius} ${innerRadius} 0 1 1 -${0.1 * scale} 0Z`;

  return path;
}

// Pattern 10: Gear (current default decorative design)
function generateCornerGearPattern(
  offsetX: number,
  offsetY: number,
  size: number
): string {
  // The original path is designed for a 74.7x74.7 viewBox
  const scale = size / 74.7002;

  // Scale and translate the path coordinates
  const transformCoord = (coord: number) => coord * scale + offsetX;
  const transformY = (coord: number) => coord * scale + offsetY;

  // Using template literals for the path - this is the new decorative design
  const path = `M${transformCoord(37.3496)} ${transformY(0)}C${transformCoord(39.2939)} ${transformY(0)} ${transformCoord(40.9948)} ${transformY(1.038_42)} ${transformCoord(41.9287)} ${transformY(2.590_82)}C${transformCoord(43.2293)} ${transformY(1.340_13)} ${transformCoord(45.1347)} ${transformY(0.780_267)} ${transformCoord(47.0098)} ${transformY(1.280_27)}C${transformCoord(48.8871)} ${transformY(1.789_28)} ${transformCoord(50.261)} ${transformY(3.237_67)} ${transformCoord(50.7578)} ${transformY(4.984_38)}C${transformCoord(52.3454)} ${transformY(4.0996)} ${transformCoord(54.3432)} ${transformY(4.047)} ${transformCoord(56.0303)} ${transformY(5.019_53)}C${transformCoord(57.7094)} ${transformY(5.987_52)} ${transformCoord(58.6586)} ${transformY(7.736_47)} ${transformCoord(58.6924)} ${transformY(9.5459)}C${transformCoord(60.4517)} ${transformY(9.106_61)} ${transformCoord(62.3883)} ${transformY(9.572_15)} ${transformCoord(63.7598)} ${transformY(10.9502)}C${transformCoord(65.1282)} ${transformY(12.3253)} ${transformCoord(65.5963)} ${transformY(14.2585)} ${transformCoord(65.1641)} ${transformY(16.0127)}C${transformCoord(66.974)} ${transformY(16.044)} ${transformCoord(68.7242)} ${transformY(16.9982)} ${transformCoord(69.7002)} ${transformY(18.6797)}C${transformCoord(70.6781)} ${transformY(20.3647)} ${transformCoord(70.6241)} ${transformY(22.3635)} ${transformCoord(69.7402)} ${transformY(23.9502)}C${transformCoord(71.4776)} ${transformY(24.4496)} ${transformCoord(72.9194)} ${transformY(25.8232)} ${transformCoord(73.4199)} ${transformY(27.7002)}C${transformCoord(73.927)} ${transformY(29.5707)} ${transformCoord(73.3661)} ${transformY(31.4794)} ${transformCoord(72.1104)} ${transformY(32.7822)}C${transformCoord(73.6621)} ${transformY(33.7163)} ${transformCoord(74.7002)} ${transformY(35.4166)} ${transformCoord(74.7002)} ${transformY(37.3604)}C${transformCoord(74.7001)} ${transformY(39.307)} ${transformCoord(73.6582)} ${transformY(41.0084)} ${transformCoord(72.1025)} ${transformY(41.9414)}C${transformCoord(73.357)} ${transformY(43.245)} ${transformCoord(73.9207)} ${transformY(45.1525)} ${transformCoord(73.4199)} ${transformY(47.0303)}C${transformCoord(72.9187)} ${transformY(48.9027)} ${transformCoord(71.4782)} ${transformY(50.2735)} ${transformCoord(69.7383)} ${transformY(50.7734)}C${transformCoord(70.6201)} ${transformY(52.3601)} ${transformCoord(70.6716)} ${transformY(54.3549)} ${transformCoord(69.7002)} ${transformY(56.04)}C${transformCoord(68.7237)} ${transformY(57.7225)} ${transformCoord(66.9721)} ${transformY(58.6729)} ${transformCoord(65.1611)} ${transformY(58.7031)}C${transformCoord(65.598)} ${transformY(60.4623)} ${transformCoord(65.131)} ${transformY(62.3982)} ${transformCoord(63.7598)} ${transformY(63.7695)}C${transformCoord(62.3847)} ${transformY(65.138)} ${transformCoord(60.4515)} ${transformY(65.6061)} ${transformCoord(58.6973)} ${transformY(65.1738)}C${transformCoord(58.6635)} ${transformY(66.9833)} ${transformCoord(57.7094)} ${transformY(68.7322)} ${transformCoord(56.0303)} ${transformY(69.7002)}C${transformCoord(54.3461)} ${transformY(70.6777)} ${transformCoord(52.348)} ${transformY(70.6248)} ${transformCoord(50.7617)} ${transformY(69.7422)}C${transformCoord(50.2643)} ${transformY(71.4831)} ${transformCoord(48.8896)} ${transformY(72.9284)} ${transformCoord(47.0098)} ${transformY(73.4297)}C${transformCoord(45.1389)} ${transformY(73.9368)} ${transformCoord(43.2296)} ${transformY(73.3763)} ${transformCoord(41.9268)} ${transformY(72.1201)}C${transformCoord(40.9927)} ${transformY(73.6717)} ${transformCoord(39.2932)} ${transformY(74.71)} ${transformCoord(37.3496)} ${transformY(74.71)}C${transformCoord(35.4051)} ${transformY(74.7098)} ${transformCoord(33.7042)} ${transformY(73.6711)} ${transformCoord(32.7705)} ${transformY(72.1182)}C${transformCoord(31.4697)} ${transformY(73.3758)} ${transformCoord(29.5597)} ${transformY(73.9418)} ${transformCoord(27.6797)} ${transformY(73.4404)}V${transformY(73.4502)}C${transformCoord(25.8065)} ${transformY(72.9422)} ${transformCoord(24.434)} ${transformY(71.4985)} ${transformCoord(23.9346)} ${transformY(69.7568)}C${transformCoord(22.3504)} ${transformY(70.6301)} ${transformCoord(20.3591)} ${transformY(70.6781)} ${transformCoord(18.6797)} ${transformY(69.71)}C${transformCoord(16.9957)} ${transformY(68.7391)} ${transformCoord(16.045)} ${transformY(66.9831)} ${transformCoord(16.0166)} ${transformY(65.168)}C${transformCoord(14.2547)} ${transformY(65.6091)} ${transformCoord(12.3134)} ${transformY(65.1435)} ${transformCoord(10.9395)} ${transformY(63.7695)}C${transformCoord(9.5687)} ${transformY(62.3919)} ${transformCoord(9.101_68)} ${transformY(60.454)} ${transformCoord(9.538_09)} ${transformY(58.6973)}C${transformCoord(7.727_91)} ${transformY(58.6641)} ${transformCoord(5.978_15)} ${transformY(57.71)} ${transformCoord(5.009_77)} ${transformY(56.0303)}C${transformCoord(4.035_52)} ${transformY(54.3517)} ${transformCoord(4.083_77)} ${transformY(52.3649)} ${transformCoord(4.958_01)} ${transformY(50.7812)}C${transformCoord(3.217_05)} ${transformY(50.2839)} ${transformCoord(1.770_87)} ${transformY(48.9101)} ${transformCoord(1.269_53)} ${transformY(47.0303)}V${transformY(47.0205)}C${transformCoord(0.762_081)} ${transformY(45.1489)} ${transformCoord(1.327_58)} ${transformY(43.2375)} ${transformCoord(2.584_96)} ${transformY(41.9346)}C${transformCoord(1.036_04)} ${transformY(41)} ${transformCoord(0.000_108_484)} ${transformY(39.3019)} ${transformCoord(0)} ${transformY(37.3604)}C${transformCoord(0)} ${transformY(35.4159)} ${transformCoord(1.038_15)} ${transformY(33.7141)} ${transformCoord(2.590_82)} ${transformY(32.7803)}C${transformCoord(1.340_44)} ${transformY(31.4797)} ${transformCoord(0.780_389)} ${transformY(29.575)} ${transformCoord(1.280_27)} ${transformY(27.7002)}C${transformCoord(1.782_58)} ${transformY(25.8232)} ${transformCoord(3.228_06)} ${transformY(24.4482)} ${transformCoord(4.973_63)} ${transformY(23.9512)}C${transformCoord(4.089_38)} ${transformY(22.3638)} ${transformCoord(4.037_43)} ${transformY(20.3664)} ${transformCoord(5.009_77)} ${transformY(18.6797)}C${transformCoord(5.978_15)} ${transformY(16.9999)} ${transformCoord(7.727_88)} ${transformY(16.0496)} ${transformCoord(9.538_09)} ${transformY(16.0166)}C${transformCoord(9.101_39)} ${transformY(14.2576)} ${transformCoord(9.568_46)} ${transformY(12.3214)} ${transformCoord(10.9395)} ${transformY(10.9502)}C${transformCoord(12.3171)} ${transformY(9.579_11)} ${transformCoord(14.2558)} ${transformY(9.111_37)} ${transformCoord(16.0127)} ${transformY(9.547_85)}C${transformCoord(16.0426)} ${transformY(7.734_21)} ${transformCoord(16.9969)} ${transformY(5.979_89)} ${transformCoord(18.6797)} ${transformY(5.009_77)}C${transformCoord(20.3596)} ${transformY(4.034_74)} ${transformCoord(22.3521)} ${transformY(4.084_68)} ${transformCoord(23.9365)} ${transformY(4.960_94)}C${transformCoord(24.4378)} ${transformY(3.227_49)} ${transformCoord(25.8059)} ${transformY(1.7898)} ${transformCoord(27.6797)} ${transformY(1.290_04)}C${transformCoord(29.5511)} ${transformY(0.782_64)} ${transformCoord(31.4617)} ${transformY(1.343_57)} ${transformCoord(32.7646)} ${transformY(2.600_59)}C${transformCoord(33.6971)} ${transformY(1.042_68)} ${transformCoord(35.4013)} ${transformY(0.000_152_405)} ${transformCoord(37.3496)} ${transformY(0)}ZM${transformCoord(41.0615)} ${transformY(9.175_78)}C${transformCoord(40.1006)} ${transformY(10.1057)} ${transformCoord(38.793)} ${transformY(10.6797)} ${transformCoord(37.3496)} ${transformY(10.6797)}C${transformCoord(35.9064)} ${transformY(10.6796)} ${transformCoord(34.5985)} ${transformY(10.1066)} ${transformCoord(33.6377)} ${transformY(9.176_76)}C${transformCoord(32.9511)} ${transformY(10.3241)} ${transformCoord(31.8358)} ${transformY(11.2176)} ${transformCoord(30.4404)} ${transformY(11.5898)}C${transformCoord(29.0527)} ${transformY(11.9661)} ${transformCoord(27.6436)} ${transformY(11.7542)} ${transformCoord(26.4766)} ${transformY(11.1074)}C${transformCoord(26.1072)} ${transformY(12.3879)} ${transformCoord(25.2629)} ${transformY(13.5333)} ${transformCoord(24.0195)} ${transformY(14.25)}C${transformCoord(22.7695)} ${transformY(14.9754)} ${transformCoord(21.347)} ${transformY(15.1322)} ${transformCoord(20.0479)} ${transformY(14.8047)}C${transformCoord(20.0289)} ${transformY(16.1454)} ${transformCoord(19.5108)} ${transformY(17.4793)} ${transformCoord(18.4902)} ${transformY(18.5)}C${transformCoord(17.4696)} ${transformY(19.5158)} ${transformCoord(16.1409)} ${transformY(20.033)} ${transformCoord(14.8066)} ${transformY(20.0566)}C${transformCoord(15.1312)} ${transformY(21.3534)} ${transformCoord(14.9738)} ${transformY(22.7723)} ${transformCoord(14.25)} ${transformY(24.0195)}C${transformCoord(13.5243)} ${transformY(25.2699)} ${transformCoord(12.3701)} ${transformY(26.1148)} ${transformCoord(11.082)} ${transformY(26.4795)}C${transformCoord(11.7347)} ${transformY(27.6479)} ${transformCoord(11.9529)} ${transformY(29.062)} ${transformCoord(11.5801)} ${transformY(30.46)}C${transformCoord(11.2085)} ${transformY(31.8485)} ${transformCoord(10.3194)} ${transformY(32.9607)} ${transformCoord(9.175_78)} ${transformY(33.6475)}C${transformCoord(10.106)} ${transformY(34.6084)} ${transformCoord(10.6797)} ${transformY(35.9167)} ${transformCoord(10.6797)} ${transformY(37.3604)}C${transformCoord(10.6796)} ${transformY(38.805)} ${transformCoord(10.1053)} ${transformY(40.1141)} ${transformCoord(9.173_83)} ${transformY(41.0752)}C${transformCoord(10.3132)} ${transformY(41.7614)} ${transformCoord(11.1999)} ${transformY(42.871)} ${transformCoord(11.5703)} ${transformY(44.2598)}C${transformCoord(11.946)} ${transformY(45.6504)} ${transformCoord(11.7335)} ${transformY(47.0592)} ${transformCoord(11.0889)} ${transformY(48.2266)}C${transformCoord(12.377)} ${transformY(48.593)} ${transformCoord(13.5297)} ${transformY(49.441)} ${transformCoord(14.25)} ${transformY(50.6904)}C${transformCoord(14.9754)} ${transformY(51.9405)} ${transformCoord(15.1322)} ${transformY(53.3629)} ${transformCoord(14.8047)} ${transformY(54.6621)}C${transformCoord(16.142)} ${transformY(54.6835)} ${transformCoord(17.4721)} ${transformY(55.2016)} ${transformCoord(18.4902)} ${transformY(56.2197)}C${transformCoord(19.5097)} ${transformY(57.2441)} ${transformCoord(20.0278)} ${transformY(58.5787)} ${transformCoord(20.0479)} ${transformY(59.918)}C${transformCoord(21.3469)} ${transformY(59.5917)} ${transformCoord(22.7696)} ${transformY(59.7493)} ${transformCoord(24.0195)} ${transformY(60.4697)}C${transformCoord(25.2676)} ${transformY(61.1892)} ${transformCoord(26.1117)} ${transformY(62.3406)} ${transformCoord(26.4775)} ${transformY(63.627)}C${transformCoord(27.6424)} ${transformY(62.9822)} ${transformCoord(29.0498)} ${transformY(62.7688)} ${transformCoord(30.4404)} ${transformY(63.1396)}C${transformCoord(31.8284)} ${transformY(63.5112)} ${transformCoord(32.9402)} ${transformY(64.3999)} ${transformCoord(33.627)} ${transformY(65.543)}C${transformCoord(34.5887)} ${transformY(64.6072)} ${transformCoord(35.9012)} ${transformY(64.0304)} ${transformCoord(37.3496)} ${transformY(64.0303)}C${transformCoord(38.7912)} ${transformY(64.0303)} ${transformCoord(40.098)} ${transformY(64.6023)} ${transformCoord(41.0586)} ${transformY(65.5303)}C${transformCoord(41.7458)} ${transformY(64.3887)} ${transformCoord(42.8594)} ${transformY(63.5007)} ${transformCoord(44.25)} ${transformY(63.1299)}C${transformCoord(45.643)} ${transformY(62.7522)} ${transformCoord(47.057)} ${transformY(62.9676)} ${transformCoord(48.2266)} ${transformY(63.6201)}C${transformCoord(48.5931)} ${transformY(62.3323)} ${transformCoord(49.4413)} ${transformY(61.1801)} ${transformCoord(50.6904)} ${transformY(60.46)}C${transformCoord(51.9373)} ${transformY(59.7364)} ${transformCoord(53.3558)} ${transformY(59.5781)} ${transformCoord(54.6523)} ${transformY(59.9023)}C${transformCoord(54.6744)} ${transformY(58.5659)} ${transformCoord(55.1925)} ${transformY(57.2372)} ${transformCoord(56.21)} ${transformY(56.2197)}C${transformCoord(57.2339)} ${transformY(55.2007)} ${transformCoord(58.5676)} ${transformY(54.6816)} ${transformCoord(59.9062)} ${transformY(54.6611)}C${transformCoord(59.5835)} ${transformY(53.3649)} ${transformCoord(59.7414)} ${transformY(51.9468)} ${transformCoord(60.46)} ${transformY(50.7002)}C${transformCoord(61.1797)} ${transformY(49.4517)} ${transformCoord(62.3312)} ${transformY(48.6068)} ${transformCoord(63.6182)} ${transformY(48.2412)}C${transformCoord(62.9651)} ${transformY(47.0726)} ${transformCoord(62.7473)} ${transformY(45.658)} ${transformCoord(63.1201)} ${transformY(44.2598)}C${transformCoord(63.4916)} ${transformY(42.8718)} ${transformCoord(64.3794)} ${transformY(41.7591)} ${transformCoord(65.5225)} ${transformY(41.0723)}C${transformCoord(64.5929)} ${transformY(40.1115)} ${transformCoord(64.0206)} ${transformY(38.8033)} ${transformCoord(64.0205)} ${transformY(37.3604)}C${transformCoord(64.0205)} ${transformY(35.9186)} ${transformCoord(64.5915)} ${transformY(34.611)} ${transformCoord(65.5195)} ${transformY(33.6504)}C${transformCoord(64.3785)} ${transformY(32.9631)} ${transformCoord(63.4908)} ${transformY(31.8501)} ${transformCoord(63.1201)} ${transformY(30.46)}C${transformCoord(62.7421)} ${transformY(29.0656)} ${transformCoord(62.9572)} ${transformY(27.6498)} ${transformCoord(63.6113)} ${transformY(26.4795)}C${transformCoord(62.3272)} ${transformY(26.1115)} ${transformCoord(61.1784)} ${transformY(25.2657)} ${transformCoord(60.46)} ${transformY(24.0195)}C${transformCoord(59.7364)} ${transformY(22.7727)} ${transformCoord(59.5781)} ${transformY(21.3541)} ${transformCoord(59.9023)} ${transformY(20.0576)}C${transformCoord(58.5626)} ${transformY(20.038)} ${transformCoord(57.23)} ${transformY(19.52)} ${transformCoord(56.21)} ${transformY(18.5)}C${transformCoord(55.1931)} ${transformY(17.4783)} ${transformCoord(54.675)} ${transformY(16.1482)} ${transformCoord(54.6523)} ${transformY(14.8125)}C${transformCoord(53.3557)} ${transformY(15.1357)} ${transformCoord(51.9374)} ${transformY(14.9785)} ${transformCoord(50.6904)} ${transformY(14.2598)}C${transformCoord(49.4399)} ${transformY(13.5339)} ${transformCoord(48.5931)} ${transformY(12.3801)} ${transformCoord(48.2285)} ${transformY(11.0918)}C${transformCoord(47.0603)} ${transformY(11.7439)} ${transformCoord(45.6474)} ${transformY(11.9624)} ${transformCoord(44.25)} ${transformY(11.5898)}V${transformY(11.5801)}C${transformCoord(42.8613)} ${transformY(11.2085)} ${transformCoord(41.7483)} ${transformY(10.3196)} ${transformCoord(41.0615)} ${transformY(9.175_78)}Z`;

  return path;
}

// Generate corner square path based on pattern type
export function generateCornerSquarePath(
  offsetX: number,
  offsetY: number,
  size: number,
  pattern: CornerEyePattern = "gear"
): string {
  switch (pattern) {
    case "square":
      return generateCornerSquarePattern(offsetX, offsetY, size);
    case "rounded":
      return generateCornerRoundedPattern(offsetX, offsetY, size);
    case "rounded-inward":
      return generateCornerRoundedInwardPattern(offsetX, offsetY, size);
    case "rounded-inward-flipped":
      return generateCornerRoundedInwardFlippedPattern(offsetX, offsetY, size);
    case "semi-round":
      return generateCornerSemiRoundPattern(offsetX, offsetY, size);
    case "rounded-extra":
      return generateCornerRoundedExtraPattern(offsetX, offsetY, size);
    case "rounded-square":
      return generateCornerRoundedSquarePattern(offsetX, offsetY, size);
    case "circle":
      return generateCornerCirclePattern(offsetX, offsetY, size);
    default:
      return generateCornerGearPattern(offsetX, offsetY, size);
  }
}
