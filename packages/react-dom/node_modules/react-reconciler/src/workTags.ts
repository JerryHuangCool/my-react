//tag指示FiberNode是什么类型的节点
export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText;
export const FunctionComponent = 0;
//挂载根节点
export const HostRoot = 3;
//例如<div>
export const HostComponent = 5;
//标签中的文本
export const HostText = 6;
