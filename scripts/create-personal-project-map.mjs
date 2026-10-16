import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {validateDocument} from '../apps/desktop/src/main/personal-store.mjs';
const groups=[
 ['产品目标',['已定：个人 Windows 思维导图','已定：独立定制，不自动合并上游']],
 ['当前架构',['已实现：Electron + React + X6','已实现：独立本地 JSON 工作区']],
 ['离线工作台',['已实现：免登录、画布与大纲','已实现：自动保存、备份导入导出']],
 ['DeepSeek 与 SDK',['已接入：Claude Agent SDK 工具桥','待验：deepseek-flash 真实请求（本轮未调用）']],
 ['中文修改预览',['已实现：新增 / 删除 / 重命名 / 移动','已实现：节点路径与前后对照']],
 ['安全与确认',['已实现：提案确认后才能写入','已实现：版本冲突、拒绝零写入、撤销']],
 ['测试与证据',['已覆盖：mock、安全边界与原生界面','待验：真实服务流式输出与工具兼容']],
 ['交付与待办',['已提供：功能分支与 Windows CI 安装包','待验：用户 Windows 实机体验与跨版本升级']],
 ['此导图的来源',['程序生成，可继续编辑与导入','非 DeepSeek 生成，不含真实密钥或用户内容']],
];
const nodes=[{id:'project',label:'EdgeEver Mind · 项目导图',shape:'topic',x:20,y:480,width:240,height:60}],edges=[];
groups.forEach(([label,children],i)=>{const id=`group-${i}`,y=i*120;nodes.push({id,label,parentId:'project',shape:'topic',x:310,y:y+24,width:200,height:48});edges.push({id:`edge-${id}`,source:'project',target:id});children.forEach((label,j)=>{const child=`${id}-${j}`;nodes.push({id:child,label,parentId:id,shape:'topic',x:560,y:y+j*52,width:390,height:44});edges.push({id:`edge-${child}`,source:id,target:child});});});
const document=validateDocument({schemaVersion:1,kind:'mind-map',nodes,edges});
const backup={version:1,revision:0,maps:[{id:'edgeever-mind-project-example',title:'EdgeEver Mind 项目导图（程序生成）',revision:0,document,undo:[],redo:[]}]};
const output=resolve(process.argv[2] ?? 'examples/edgeever-mind-project.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(backup,null,2)+'\n');console.log(`Wrote ${nodes.length} editable topics to ${output}`);
