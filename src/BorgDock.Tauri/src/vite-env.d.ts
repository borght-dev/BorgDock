/// <reference types="vite/client" />
declare module '*.scm?raw' {
  const content: string;
  export default content;
}
