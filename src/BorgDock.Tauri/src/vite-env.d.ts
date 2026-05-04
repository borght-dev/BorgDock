/// <reference types="vite/client" />
declare const __BORGDOCK_VERSION__: string;
declare module '*.scm?raw' {
  const content: string;
  export default content;
}
