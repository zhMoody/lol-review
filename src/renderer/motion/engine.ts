/**
 * GSAP 动效封装。
 *
 * 规范（docs/02 §4）：全局仅 4 个动效。
 * 硬要求：prefers-reduced-motion 时全部降为瞬时，且不动 layout。
 */
import gsap from 'gsap'

/** 全局降级开关，由 engine 初始化时读取 */
let reducedMotion = false

export function initMotion(): void {
  if (typeof window === 'undefined') return
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = query.matches
  query.addEventListener('change', (e) => {
    reducedMotion = e.matches
  })
}

export function isReducedMotion(): boolean {
  return reducedMotion
}

/** 区块入场：opacity + translateY，可 stagger（docs/02 M-03） */
export function enter(
  elements: Element | Element[],
  opts: { stagger?: number; delay?: number; y?: number } = {},
): gsap.core.Tween {
  const targets = Array.isArray(elements) ? elements : [elements]
  const { stagger = 0.04, delay = 0, y = 8 } = opts

  if (reducedMotion) {
    return gsap.set(targets, { opacity: 1, y: 0, clearProps: 'all' })
  }

  return gsap.fromTo(
    targets,
    { opacity: 0, y },
    {
      opacity: 1,
      y: 0,
      duration: 0.28,
      ease: 'power2.out',
      stagger,
      delay,
      clearProps: 'transform',
    },
  )
}

/** 数据变化：宽度/透明度（docs/02 M-04） */
export function animateWidth(
  element: Element,
  widthPercent: number,
  opts: { delay?: number } = {},
): gsap.core.Tween {
  if (reducedMotion) {
    return gsap.set(element, { width: `${widthPercent}%` })
  }
  return gsap.to(element, {
    width: `${widthPercent}%`,
    duration: 0.6,
    ease: 'power2.out',
    delay: opts.delay ?? 0,
  })
}

/** 元素消失 */
export function exit(elements: Element | Element[]): gsap.core.Tween {
  const targets = Array.isArray(elements) ? elements : [elements]
  if (reducedMotion) return gsap.set(targets, { opacity: 0 })
  return gsap.to(targets, {
    opacity: 0,
    duration: 0.12,
    ease: 'power2.in',
    onComplete: () => gsap.set(targets, { visibility: 'hidden' }),
  })
}
