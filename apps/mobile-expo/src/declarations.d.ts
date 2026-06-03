declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.css';

declare module 'web-streams-polyfill';
declare module 'fast-text-encoding';
