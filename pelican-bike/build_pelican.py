# -*- coding: utf-8 -*-
"""Generate index.html: SVG 2D animation of a pelican riding a bicycle.
Leg pedaling is solved with exact two-link inverse kinematics baked into
CSS keyframes (36 steps per crank revolution), so the feet stay locked
on the pedals through the whole cycle."""
import math
import os

HIP = (402.0, 288.0)          # hip joint
C   = (452.0, 410.0)          # bottom bracket (crank axle)
R   = 40.0                    # crank length
L1, L2 = 95.0, 80.0           # thigh, shin length


def ik(theta_deg):
    """Return (thigh_angle, shin_angle, knee, foot) for crank angle."""
    th = math.radians(theta_deg)
    fx, fy = C[0] + R * math.cos(th), C[1] + R * math.sin(th)
    dx, dy = fx - HIP[0], fy - HIP[1]
    d = max(math.hypot(dx, dy), 1e-6)
    c = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)
    c = max(-1.0, min(1.0, c))
    t1 = math.atan2(dy, dx) - math.acos(c)          # knee bends forward
    kx, ky = HIP[0] + L1 * math.cos(t1), HIP[1] + L1 * math.sin(t1)
    t2 = math.atan2(fy - ky, fx - kx)
    return t1, t2, (kx, ky), (fx, fy)


def fmt(x):
    s = f"{x:.2f}"
    s = s.rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


N = 36                       # steps per revolution
T_DEG = 360.0 / N            # degrees per step

base_t1, base_t2, knee0, foot0 = ik(0)

thigh_rows, shin_rows = [], []
for i in range(N + 1):
    pct = fmt(i * 100.0 / N)
    t1, t2, _, _ = ik((i % N) * T_DEG)
    thigh_rows.append(f'{pct}%{{transform:rotate({fmt(math.degrees(t1 - base_t1))}deg)}}')
    # 小腿帧存相对角：世界角差再减去大腿已转的角度（大腿旋转由嵌套的外层组承担）
    shin_rows.append(f'{pct}%{{transform:rotate({fmt(math.degrees((t2 - base_t2) - (t1 - base_t1)))}deg)}}')

LEG_KF = (
    "@keyframes thighPedal{" + "".join(thigh_rows) + "}\n"
    "@keyframes shinPedal{" + "".join(shin_rows) + "}"
)

PIVOT_THIGH = f"transform-origin:{fmt(HIP[0])}px {fmt(HIP[1])}px"
PIVOT_SHIN = f"transform-origin:{fmt(knee0[0])}px {fmt(knee0[1])}px"

HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>鹈鹕骑自行车 · SVG 2D 动画</title>
<style>
  html,body{height:100%;margin:0}
  body{
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(#bfe7fb,#eefbf4);
    font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  }
  svg{width:min(96vw,150vh);height:auto;display:block;
      filter:drop-shadow(0 18px 30px rgba(30,60,90,.16))}
  /* 所有动画元素以 viewBox 坐标系为变换基准 */
  svg *{transform-box:view-box}

  /* ---- 关键帧 ---- */
  __LEG_KF__
  @keyframes wheelSpin{to{transform:rotate(360deg)}}
  @keyframes crankSpin{to{transform:rotate(360deg)}}
  @keyframes pedalCtr{to{transform:rotate(-360deg)}}
  @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
  @keyframes shadowPulse{0%,100%{transform:scaleX(1);opacity:.17}50%{transform:scaleX(.93);opacity:.24}}
  @keyframes raysTurn{to{transform:rotate(360deg)}}
  @keyframes cloudDrift{to{transform:translateX(-1750px)}}
  @keyframes hillScroll{to{transform:translateX(-1680px)}}
  @keyframes hillScroll2{to{transform:translateX(-1680px)}}
  @keyframes treeScroll{to{transform:translateX(-300px)}}
  @keyframes dashScroll{to{transform:translateX(-130px)}}
  @keyframes grassScroll{to{transform:translateX(-240px)}}
  @keyframes chainRun{to{stroke-dashoffset:-52}}
  @keyframes nod{0%,100%{transform:rotate(0deg)}25%{transform:rotate(1.6deg)}75%{transform:rotate(-1.2deg)}}
  @keyframes flap{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-3.5deg)}}
  @keyframes tailWag{0%,100%{transform:rotate(0deg)}50%{transform:rotate(3.5deg)}}
  @keyframes squawk{
    0%,76%{transform:rotate(0deg)}
    81%{transform:rotate(13deg)}
    85%{transform:rotate(9deg)}
    89%{transform:rotate(16deg)}
    94%,100%{transform:rotate(0deg)}
  }
  @keyframes bubbleShow{
    0%,73%{opacity:0;transform:translateY(10px)}
    79%,90%{opacity:1;transform:translateY(0)}
    97%,100%{opacity:0;transform:translateY(-6px)}
  }
  @keyframes whoosh{
    0%{opacity:0;transform:translateX(20px)}
    35%{opacity:.75}
    70%,100%{opacity:0;transform:translateX(-42px)}
  }

  /* ---- 应用 ---- */
  .riderBob{animation:bob .8s ease-in-out infinite}
  .shadow{transform-box:fill-box;transform-origin:center;animation:shadowPulse .8s ease-in-out infinite}
  .rays{animation:raysTurn 26s linear infinite}
  .cl1{animation:cloudDrift 22s linear infinite;animation-delay:-7s}
  .cl2{animation:cloudDrift 32s linear infinite;animation-delay:-19s}
  .cl3{animation:cloudDrift 15s linear infinite;animation-delay:-3s}
  .hillsFar{animation:hillScroll 24s linear infinite}
  .hillsNear{animation:hillScroll2 12s linear infinite}
  .trees{animation:treeScroll 1.9s linear infinite}
  .roadDash{animation:dashScroll .42s linear infinite}
  .grassFG{animation:grassScroll .75s linear infinite}
  .chainLink{stroke-dasharray:7 6;animation:chainRun .55s linear infinite}
  .wheelSpin{animation:wheelSpin 1.6s linear infinite}
  .crank{animation:crankSpin 1.6s linear infinite}
  .crankFar{animation:crankSpin 1.6s linear infinite;animation-delay:-.8s}
  .pedalC{animation:pedalCtr 1.6s linear infinite}
  .pedalCFar{animation:pedalCtr 1.6s linear infinite;animation-delay:-.8s}
  .thighR,.thighF{@PIVOT_THIGH@;animation:thighPedal 1.6s linear infinite}
  .thighF{animation-delay:-.8s}
  .shinR,.shinF{@PIVOT_SHIN@;animation:shinPedal 1.6s linear infinite}
  .shinF{animation-delay:-.8s}
  .headNod{@HSO@;animation:nod .8s ease-in-out infinite}
  .wingFlap{@WSO@;animation:flap .8s ease-in-out infinite}
  .tailWag{@TSO@;animation:tailWag 1.6s ease-in-out infinite}
  .pouchSq{@PSO@;animation:squawk 7s ease-in-out infinite}
  .bubble{@BSO@;animation:bubbleShow 7s ease-out infinite}

  .sl1{animation:whoosh 1.7s linear infinite}
  .sl2{animation:whoosh 1.7s linear infinite;animation-delay:.28s}
  .sl3{animation:whoosh 1.7s linear infinite;animation-delay:.56s}

  @media (prefers-reduced-motion:reduce){
    svg *{animation-play-state:paused!important}
  }
</style>
</head>
<body>
<svg viewBox="0 0 960 560" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="一只鹈鹕骑着自行车，在乡间公路上前行，车筐里还放着一条鱼">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfe7fb"/>
      <stop offset="62%" stop-color="#dff3fa"/>
      <stop offset="100%" stop-color="#eefbf4"/>
    </linearGradient>
    <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#80909f"/>
      <stop offset="100%" stop-color="#5d6d7e"/>
    </linearGradient>
    <radialGradient id="bodyG" cx="42%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="72%" stop-color="#f6fafc"/>
      <stop offset="100%" stop-color="#e4edf4"/>
    </radialGradient>
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe9a8" stop-opacity=".9"/>
      <stop offset="100%" stop-color="#ffe9a8" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- ======== 背景 ======== -->
  <rect width="960" height="560" fill="url(#sky)"/>

  <!-- 太阳 -->
  <g>
    <circle cx="840" cy="104" r="86" fill="url(#sunGlow)"/>
    <g class="rays" style="transform-origin:840px 104px">
      <g stroke="#ffd66b" stroke-width="5" stroke-linecap="round" opacity=".8">
        <line x1="840" y1="52"  x2="840" y2="64"/>
        <line x1="840" y1="144" x2="840" y2="156"/>
        <line x1="788" y1="104" x2="800" y2="104"/>
        <line x1="880" y1="104" x2="892" y2="104"/>
        <line x1="804" y1="68"  x2="812" y2="76"/>
        <line x1="868" y1="132" x2="876" y2="140"/>
        <line x1="876" y1="68"  x2="868" y2="76"/>
        <line x1="812" y1="132" x2="804" y2="140"/>
        <line x1="819" y1="57"  x2="823" y2="67"/>
        <line x1="857" y1="141" x2="861" y2="151"/>
        <line x1="797" y1="83"  x2="807" y2="87"/>
        <line x1="873" y1="121" x2="883" y2="125"/>
      </g>
    </g>
    <circle cx="840" cy="104" r="33" fill="#ffd66b"/>
    <circle cx="831" cy="96" r="10" fill="#ffe7a1" opacity=".8"/>
  </g>

  <!-- 云 -->
  <g fill="#ffffff" opacity=".92">
    <g class="cl1"><g transform="translate(1120,92)">
      <ellipse cx="0" cy="0" rx="56" ry="21"/><ellipse cx="-38" cy="7" rx="30" ry="15"/>
      <ellipse cx="40" cy="6" rx="34" ry="17"/><ellipse cx="6" cy="-15" rx="29" ry="17"/>
    </g></g>
    <g class="cl2"><g transform="translate(1150,58) scale(.78)">
      <ellipse cx="0" cy="0" rx="56" ry="21"/><ellipse cx="-38" cy="7" rx="30" ry="15"/>
      <ellipse cx="40" cy="6" rx="34" ry="17"/><ellipse cx="6" cy="-15" rx="29" ry="17"/>
    </g></g>
    <g class="cl3"><g transform="translate(1140,132) scale(1.25)">
      <ellipse cx="0" cy="0" rx="56" ry="21"/><ellipse cx="-38" cy="7" rx="30" ry="15"/>
      <ellipse cx="40" cy="6" rx="34" ry="17"/><ellipse cx="6" cy="-15" rx="29" ry="17"/>
    </g></g>
  </g>

  <!-- 远山 -->
  <g class="hillsFar" fill="#cfe8da">
    <path d="__HILLS_FAR__"/>
  </g>
  <!-- 近山丘 -->
  <g class="hillsNear" fill="#abdcb8">
    <path d="__HILLS_NEAR__"/>
  </g>

  <!-- 路边树 -->
  <g class="trees">
    __TREES__
  </g>

  <!-- 公路 -->
  <rect x="0" y="480" width="960" height="80" fill="url(#roadGrad)"/>
  <rect x="0" y="480" width="960" height="5" fill="#93a3b2"/>
  <g class="roadDash" fill="#ffe98a" opacity=".95">__DASHES__</g>

  <!-- 风线 -->
  <g stroke="#dff3fb" stroke-linecap="round" stroke-width="6">
    <line class="sl1" x1="108" y1="368" x2="172" y2="368"/>
    <line class="sl2" x1="122" y1="406" x2="198" y2="406"/>
    <line class="sl3" x1="96"  y1="444" x2="154" y2="444"/>
  </g>

  <!-- 影子 -->
  <ellipse class="shadow" cx="462" cy="500" rx="205" ry="13" fill="#2b3a47"/>

  <!-- ======== 骑行者与自行车（整体轻微上下起伏） ======== -->
  <g class="riderBob">

    <!-- 远侧腿（深色，半拍相位差） -->
    <g>
      <g class="thighF">
        <line x1="402" y1="288" x2="__KX__" y2="__KY__" stroke="#e08c2a" stroke-width="12" stroke-linecap="round"/>
        <g class="shinF">
          <line x1="__KX__" y1="__KY__" x2="492" y2="410" stroke="#e08c2a" stroke-width="11" stroke-linecap="round"/>
        </g>
      </g>
    </g>

    <!-- 后轮 -->
    <g>
      <circle cx="320" cy="400" r="88" fill="none" stroke="#33424e" stroke-width="11"/>
      <circle cx="320" cy="400" r="74" fill="none" stroke="#dbe7ee" stroke-width="5"/>
      <g class="wheelSpin" style="transform-origin:320px 400px">
        <g stroke="#dbe7ee" stroke-width="3.5">
          <line x1="320" y1="330" x2="320" y2="470"/>
          <line x1="250" y1="400" x2="390" y2="400"/>
          <line x1="270" y1="350" x2="370" y2="450"/>
          <line x1="370" y1="350" x2="270" y2="450"/>
          <line x1="298" y1="333" x2="342" y2="467"/>
          <line x1="342" y1="333" x2="298" y2="467"/>
        </g>
        <circle cx="320" cy="340" r="4" fill="#ff8fab"/>
      </g>
      <circle cx="320" cy="400" r="11" fill="#33424e"/>
      <circle cx="320" cy="400" r="4.5" fill="#ffd166"/>
      <!-- 飞轮 -->
      <circle cx="320" cy="400" r="18" fill="none" stroke="#9fb0bd" stroke-width="5"/>
    </g>

    <!-- 前轮 -->
    <g>
      <circle cx="600" cy="400" r="88" fill="none" stroke="#33424e" stroke-width="11"/>
      <circle cx="600" cy="400" r="74" fill="none" stroke="#dbe7ee" stroke-width="5"/>
      <g class="wheelSpin" style="transform-origin:600px 400px">
        <g stroke="#dbe7ee" stroke-width="3.5">
          <line x1="600" y1="330" x2="600" y2="470"/>
          <line x1="530" y1="400" x2="670" y2="400"/>
          <line x1="550" y1="350" x2="650" y2="450"/>
          <line x1="650" y1="350" x2="550" y2="450"/>
          <line x1="578" y1="333" x2="622" y2="467"/>
          <line x1="622" y1="333" x2="578" y2="467"/>
        </g>
        <circle cx="600" cy="340" r="4" fill="#ff8fab"/>
      </g>
      <circle cx="600" cy="400" r="11" fill="#33424e"/>
      <circle cx="600" cy="400" r="4.5" fill="#ffd166"/>
    </g>

    <!-- 远侧曲柄 + 脚踏（画在车架后面） -->
    <g>
      <g class="crankFar" style="transform-origin:452px 410px">
        <line x1="452" y1="410" x2="492" y2="410" stroke="#8d99a3" stroke-width="9" stroke-linecap="round"/>
        <g class="pedalCFar" style="transform-origin:492px 410px">
          <rect x="479" y="406" width="27" height="9" rx="4" fill="#2c3944"/>
          <path d="M474,403 Q489,395 510,401 Q496,412 478,410 Z" fill="#e07f22"/>
        </g>
      </g>
    </g>

    <!-- 车架 -->
    <g stroke="#ff6b57" stroke-width="10" stroke-linecap="round" fill="none">
      <path d="M452,410 L566,310"/>              <!-- 下管 -->
      <path d="M452,410 L394,268"/>              <!-- 座管 -->
      <path d="M402,286 L560,300"/>              <!-- 上管 -->
      <path d="M452,410 L320,400"/>              <!-- 后下叉 -->
      <path d="M322,398 L396,272"/>              <!-- 后上叉 -->
    </g>
    <g fill="none" stroke="#ff6b57">
      <path d="M562,286 L578,308" stroke-width="13"/>          <!-- 头管 -->
      <path d="M576,304 Q586,352 600,396" stroke-width="8"/>   <!-- 前叉 -->
      <path d="M566,290 L550,271" stroke-width="8"/>           <!-- 立管 -->
    </g>
    <path d="M550,271 Q536,258 527,267" fill="none" stroke="#4a5560" stroke-width="7" stroke-linecap="round"/>
    <circle cx="529" cy="268" r="8" fill="#33424e"/>

    <!-- 车座 -->
    <rect x="371" y="256" width="50" height="13" rx="6.5" fill="#7c4a2d"/>
    <rect x="389" y="266" width="10" height="14" rx="4" fill="#8d5a3b"/>

    <!-- 牙盘 + 链条 -->
    <g class="crank" style="transform-origin:452px 410px">
      <circle cx="452" cy="410" r="16" fill="none" stroke="#cfd8e0" stroke-width="5"/>
    </g>
    <line class="chainLink" x1="322" y1="388" x2="450" y2="396" stroke="#9fb0bd" stroke-width="4"/>
    <line class="chainLink" x1="322" y1="412" x2="450" y2="424" stroke="#9fb0bd" stroke-width="4"/>

    <!-- 车筐和小鱼 -->
    <g>
      <line x1="594" y1="298" x2="571" y2="288" stroke="#a9743f" stroke-width="4"/>
      <line x1="650" y1="298" x2="577" y2="301" stroke="#a9743f" stroke-width="4"/>
      <g transform="translate(618,288) rotate(-18)">
        <ellipse cx="0" cy="0" rx="17" ry="8" fill="#63b3ed"/>
        <polygon points="-14,-2 -26,-9 -26,9" fill="#63b3ed"/>
        <circle cx="9" cy="-2.5" r="1.8" fill="#1a365d"/>
      </g>
      <path d="M592,300 L652,300 L643,342 L601,342 Z" fill="#c98d4e" stroke="#a3703a" stroke-width="2.5"/>
      <line x1="596" y1="312" x2="649" y2="312" stroke="#a3703a" stroke-width="2"/>
      <line x1="598" y1="324" x2="647" y2="324" stroke="#a3703a" stroke-width="2"/>
      <line x1="598" y1="336" x2="645" y2="336" stroke="#a3703a" stroke-width="2"/>
      <line x1="610" y1="301" x2="612" y2="341" stroke="#a3703a" stroke-width="2"/>
      <line x1="625" y1="301" x2="626" y2="341" stroke="#a3703a" stroke-width="2"/>
      <line x1="640" y1="301" x2="638" y2="341" stroke="#a3703a" stroke-width="2"/>
    </g>

    <!-- ======== 鹈鹕 ======== -->
    <!-- 尾羽 -->
    <g class="tailWag" style="transform-origin:332px 214px">
      <path d="M330,196 L296,178 L306,204 L272,200 L300,222 L280,238 L318,236 Z"
            fill="#eef4f9" stroke="#dbe5ee" stroke-width="3" stroke-linejoin="round"/>
    </g>

    <!-- 身体 -->
    <g>
      <ellipse cx="392" cy="232" rx="82" ry="57" transform="rotate(-9 392 232)" fill="url(#bodyG)"/>
      <path d="M320,252 Q392,304 462,246 Q430,282 380,282 Q336,276 320,252 Z" fill="#e4edf4" opacity=".8"/>
      <path d="M352,268 q10,14 26,12 M382,278 q10,12 26,8" stroke="#dbe5ee" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>

    <!-- 颈 -->
    <path d="M430,226 Q466,176 506,152" fill="none" stroke="#fdfefe" stroke-width="30" stroke-linecap="round"/>
    <path d="M446,232 Q480,190 512,164" fill="none" stroke="#e6eef5" stroke-width="7" stroke-linecap="round" opacity=".85"/>

    <!-- 头部 -->
    <g class="headNod" style="transform-origin:506px 152px">
      <circle cx="512" cy="146" r="25" fill="#fdfefe"/>
      <path d="M505,123 q4,-10 12,-8 M516,121 q6,-8 13,-5" fill="none" stroke="#e6eef5" stroke-width="4" stroke-linecap="round"/>
      <!-- 喉囊（会张合） -->
      <g class="pouchSq" style="transform-origin:524px 148px">
        <path d="M524,142 q10,4 4,10 l-2,4 Z" fill="#7a4a1f"/>
        <path d="M523,151 Q562,212 625,199 Q585,168 526,153 Z"
              fill="#ffa94d" stroke="#f08c1f" stroke-width="2.5" stroke-linejoin="round"/>
      </g>
      <!-- 上喙 -->
      <path d="M520,137 Q590,146 641,192 Q600,160 519,151 Z"
            fill="#ffb347" stroke="#e8912e" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M540,144 L556,147" stroke="#e8912e" stroke-width="2" stroke-linecap="round"/>
      <!-- 眼睛和眉毛 -->
      <circle cx="521" cy="133" r="7" fill="#ffffff" stroke="#dbe5ee" stroke-width="1.5"/>
      <circle cx="522.5" cy="134" r="3.6" fill="#2f3542"/>
      <circle cx="524" cy="132.4" r="1.2" fill="#ffffff"/>
      <path d="M512,122 q9,-5 17,-1" fill="none" stroke="#c9d6e2" stroke-width="3" stroke-linecap="round"/>
    </g>

    <!-- 近侧翅膀（搭在车把上） -->
    <g class="wingFlap" style="transform-origin:432px 212px">
      <path d="M428,213 Q521,194 541,262 Q492,240 436,249 Q418,233 428,213 Z"
            fill="#eaf1f7" stroke="#d5e1ea" stroke-width="3" stroke-linejoin="round"/>
      <path d="M447,225 Q497,220 528,248 M444,238 Q486,236 514,255"
            fill="none" stroke="#d5e1ea" stroke-width="3" stroke-linecap="round"/>
    </g>

    <!-- 近侧腿 -->
    <g class="thighR">
      <line x1="402" y1="288" x2="__KX__" y2="__KY__" stroke="#ffab3d" stroke-width="13" stroke-linecap="round"/>
      <g class="shinR">
        <line x1="__KX__" y1="__KY__" x2="492" y2="410" stroke="#ffab3d" stroke-width="12" stroke-linecap="round"/>
      </g>
    </g>

    <!-- 近侧曲柄 + 脚踏 + 蹼足 -->
    <g class="crank" style="transform-origin:452px 410px">
      <line x1="452" y1="410" x2="492" y2="410" stroke="#c3cdd4" stroke-width="9" stroke-linecap="round"/>
      <g class="pedalC" style="transform-origin:492px 410px">
        <rect x="478" y="405" width="29" height="10" rx="4.5" fill="#33424e"/>
        <path d="M472,402 Q489,392 512,400 Q498,413 477,410 Z" fill="#ff9432"/>
        <path d="M480,405 q10,-4 20,0" fill="none" stroke="#e07f22" stroke-width="2" stroke-linecap="round"/>
      </g>
    </g>

    <!-- 对话气泡 -->
    <g class="bubble" style="transform-origin:600px 90px">
      <g transform="translate(585,42)">
        <polygon points="14,42 34,42 2,88" fill="#ffffff" stroke="#cfdeeb" stroke-width="2"/>
        <rect x="0" y="0" width="206" height="46" rx="15" fill="#ffffff" stroke="#cfdeeb" stroke-width="2.5"/>
        <text x="103" y="30" text-anchor="middle" font-size="19" font-weight="600" fill="#3f5f7d">鱼店还有多远呀？</text>
      </g>
    </g>
  </g>

  <!-- 前景草丛 -->
  <g class="grassFG" fill="#3f7d54">__GRASS__</g>
</svg>
</body>
</html>
"""


def bumps(y_base, pairs):
    """Rolling hills tiled leftward margin -840, each element one full
    420px period (two cubic bumps); triples of the 4-pair block keep the
    whole strip invariant under the 1680px loop translation."""
    n = len(pairs)
    out = [f"M-840,{y_base}"]
    x = -840
    for h1, h2 in pairs:
        w = 210
        out.append(f"C{x+w*0.25},{y_base-h1*1.6} {x+w*0.75},{y_base-h1*1.6} {x+w},{y_base}")
        out.append(f"C{x+w+w*0.25},{y_base-h2*1.6} {x+w+w*0.75},{y_base-h2*1.6} {x+w*2},{y_base}")
        x += 420
    out.append(f"L{x},{y_base} Z")
    return "".join(out), n


# 远山：平缓；近丘：更高。基础块 4 单元（1680px）与循环平移量一致，重复 3 块保证全程覆盖
far_pairs  = [(28, 16), (34, 22), (26, 18), (32, 20)]
near_pairs = [(44, 24), (52, 30), (40, 26), (48, 28)]
hills_far,  _ = bumps(482, far_pairs * 3)
hills_near, _ = bumps(484, near_pairs * 3)

# 树木带：周期 300
tree_specs = [
    (18, 20, "#4fae7e"), (120, 14, "#67c290"), (215, 24, "#3f9e6f"),
]
trees = []
for rep in range(7):
    ox = -300 + rep * 300
    for tx, tr, tc in tree_specs:
        x = ox + tx
        base_y = 486
        trees.append(
            f'<g><rect x="{x-3}" y="{base_y-tr*1.55-14}" width="6" height="{tr*1.05+14}" rx="3" fill="#8a5a35"/>'
            f'<circle cx="{x}" cy="{base_y-tr*1.8-6}" r="{tr}" fill="{tc}"/></g>'
        )
trees_svg = "".join(trees)

# 公路中线虚线：周期 130
dashes = "".join(
    f'<rect x="{-130 + k * 130}" y="516" width="72" height="8" rx="4"/>' for k in range(11)
)

# 前景草丛：周期 240
grass_parts = []
for rep in range(6):
    gx = -240 + rep * 240
    for dx, s in ((0, 1.0), (86, 0.8), (170, 1.15)):
        x, sc = gx + dx, s
        grass_parts.append(
            f'<g transform="translate({x},562) scale({sc})">'
            f'<path d="M0,0 C-4,-14 -14,-20 -18,-30 C-6,-24 -2,-14 0,-6 '
            f'C2,-16 8,-24 16,-32 C10,-20 6,-12 4,0 Z"/></g>'
        )
grass_svg = "".join(grass_parts)

out = (HTML
       .replace("__LEG_KF__", LEG_KF)
       .replace("@PIVOT_THIGH@", PIVOT_THIGH)
       .replace("@PIVOT_SHIN@", PIVOT_SHIN)
       .replace("@HSO@", f"transform-origin:506px 152px")
       .replace("@WSO@", f"transform-origin:432px 212px")
       .replace("@TSO@", f"transform-origin:332px 214px")
       .replace("@PSO@", f"transform-origin:524px 148px")
       .replace("@BSO@", f"transform-origin:700px 80px")
       .replace("__KX__", fmt(knee0[0]))
       .replace("__KY__", fmt(knee0[1]))
       .replace("__HILLS_FAR__", hills_far)
       .replace("__HILLS_NEAR__", hills_near)
       .replace("__TREES__", trees_svg)
       .replace("__DASHES__", dashes)
       .replace("__GRASS__", grass_svg))

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html"),
          "w", encoding="utf-8") as f:
    f.write(out)

# ---------------------------------------------------------------------------
# 插件资产：从最终 HTML 派生 src/client/pelican/art.ts，供壁纸层使用。
# 预览页(index.html)路径不受影响；此段只做文本级确定性变换。
# ---------------------------------------------------------------------------
import json
import re

SCOPE = "dshPelicanBike"          # 组件容器上的作用域类名
KF_PREFIX = "pb_"                 # keyframes 名前缀，避免与宿主页面全局名冲突


def _top_level_blocks(css):
    """Split a stylesheet into (header, body-or-None) top-level segments."""
    blocks = []
    i, n = 0, len(css)
    while i < n:
        b = css.find("{", i)
        if b == -1:
            tail = css[i:].strip()
            if tail:
                blocks.append((tail, None))
            break
        header = css[i:b].strip()
        depth, j = 1, b + 1
        while j < n and depth > 0:
            if css[j] == "{":
                depth += 1
            elif css[j] == "}":
                depth -= 1
            j += 1
        blocks.append((header, css[b + 1:j - 1]))
        i = j
    return blocks


def _scope_selector(selector):
    """Scope one selector (.cls / svg *) under the layer root class."""
    s = selector.strip()
    if s == "svg *":
        return "." + SCOPE + " svg *"
    if s == "svg":
        return "." + SCOPE + " svg"
    if s.startswith("."):
        return "." + SCOPE + " " + s
    raise ValueError("unexpected selector for scoping: %r" % selector)


def plugin_css_from(page_css):
    """Page stylesheet -> scoped plugin stylesheet."""
    css = re.sub(r"/\*.*?\*/", "", page_css, flags=re.S)      # cosmetic comments off
    kf_names = set(re.findall(r"@keyframes\s+([A-Za-z][\w-]*)", css))

    def rename_kf(m):
        return "@keyframes " + KF_PREFIX + m.group(1)

    css = re.sub(r"@keyframes\s+([A-Za-z][\w-]*)", rename_kf, css)

    def rename_ref(m):
        head, name = m.group(1), m.group(2)
        return head + (KF_PREFIX + name if name in kf_names else name)

    css = re.sub(r"(animation\s*:\s*)([A-Za-z][\w-]*)", rename_ref, css)

    pieces = []
    for header, body in _top_level_blocks(css):
        if body is None:                       # stray whitespace
            continue
        if header.startswith("@keyframes"):
            pieces.append(header + "{" + body + "}")
        elif header.startswith("@media"):
            subs = []
            for h2, b2 in _top_level_blocks(body):
                subs.append(_scope_selector(h2) + "{" + b2 + "}")
            pieces.append(header + "{" + "".join(subs) + "}")
        elif header in ("html,body", "body", "svg"):
            continue                            # page-level rules: dropped
        else:
            sel = ",".join(_scope_selector(p) for p in header.split(","))
            pieces.append(sel + "{" + body + "}")
    return "\n".join(pieces)


def plugin_svg_from(html):
    """Extract the <svg> element and make it cover-fit for the wallpaper."""
    i = html.find("<svg")
    j = html.find(">", i)
    tag = html[i:j]
    if "preserveAspectRatio" not in tag:
        tag += ' preserveAspectRatio="xMidYMid slice"'
    k = html.rfind("</svg>")
    # html[j] 是开标签的收尾 '>'，切片不含它，这里补回
    return tag + ">" + html[j + 1:k] + "</svg>"


page_style = re.search(r"<style>(.*?)</style>", out, re.S).group(1)
PLUGIN_CSS = plugin_css_from(page_style)
PLUGIN_SVG = plugin_svg_from(out)

ART_TS = (
    "/**\n"
    " * GENERATED FILE — regenerate with: python pelican-bike/build_pelican.py\n"
    " * Do not edit by hand. The standalone preview is pelican-bike/index.html;\n"
    " * this module packages the same artwork for the wallpaper layer.\n"
    " *\n"
    " * @module dsh-wallpapers/src/client/pelican/art\n"
    " */\n"
    "\n"
    "/** Class wrapping the mounted artwork; every scoped rule hangs off it. */\n"
    "export const PELICAN_SCOPE = %s\n"
    "\n"
    "/** Complete <svg> markup (static, script-free), cover-fit for the layer. */\n"
    "export const PELICAN_SVG = %s\n"
    "\n"
    "/** Scoped stylesheet: IK pedaling keyframes plus scene loops. */\n"
    "export const PELICAN_CSS = %s\n"
) % (json.dumps(SCOPE), json.dumps(PLUGIN_SVG, ensure_ascii=False),
     json.dumps(PLUGIN_CSS, ensure_ascii=False))

plugin_dir = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "src", "client", "pelican"))
os.makedirs(plugin_dir, exist_ok=True)
with open(os.path.join(plugin_dir, "art.ts"), "w", encoding="utf-8") as f:
    f.write(ART_TS)

print("OK  knee0=", fmt(knee0[0]), fmt(knee0[1]),
      " foot0=", fmt(foot0[0]), fmt(foot0[1]),
      " bytes=", len(out.encode("utf-8")),
      " art.ts bytes=", len(ART_TS.encode("utf-8")))
