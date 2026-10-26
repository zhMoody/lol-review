/**
 * CSS Modules 类型声明。
 * 没有这个，tsc 和 eslint 的类型感知规则会把 styles.xxx 判成 error 类型。
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.module.scss' {
  const classes: Record<string, string>
  export default classes
}
