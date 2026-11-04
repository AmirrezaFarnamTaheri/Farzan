/**
 * Single fail-closed, offline-safe paint contract for Konva and SVG.
 * Deliberately accept only standalone colors with deterministic numeric ranges.
 * Unknown CSS Color 4 expressions must not silently render differently when
 * exported or when the board is reopened on another device.
 */
const CSS_NAMED_COLORS = new Set(`
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue
cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey
lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue
purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
yellowgreen transparent
`.trim().split(/\s+/));


const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const numericInRange = (value, maximum) =>
  DECIMAL.test(value) && Number(value) >= 0 && Number(value) <= maximum;
const percentage = value => value.endsWith('%')
  && numericInRange(value.slice(0, -1), 100);
const rgbChannel = value => (/^\d{1,3}$/.test(value) && Number(value) <= 255)
  || percentage(value);
const alpha = value => numericInRange(value, 1) || percentage(value);
const hue = value => /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg)?$/.test(value);

function standaloneFunctionColor(paint) {
  const match = /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/.exec(paint);
  if (!match) return false;
  const [, kind, raw] = match;
  const parts = raw.split(',').map(part => part.trim());
  if (parts.length !== (kind.endsWith('a') ? 4 : 3)) return false;
  if (kind.startsWith('rgb')) {
    return parts.slice(0, 3).every(rgbChannel)
      && (parts.length === 3 || alpha(parts[3]));
  }
  return hue(parts[0]) && percentage(parts[1]) && percentage(parts[2])
    && (parts.length === 3 || alpha(parts[3]));
}

export function isNoStandalonePaint(value) {
  return typeof value === 'string' && value.toLowerCase() === 'none';
}

export function isStandalonePaint(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  const paint = value.toLowerCase();
  if (paint === 'none' || CSS_NAMED_COLORS.has(paint)) return true;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(paint)) return true;
  return standaloneFunctionColor(paint);
}
