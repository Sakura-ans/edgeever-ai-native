import {computeDiagramLayout} from '@edgeever/shared/diagram-layout';
import {mindMapNodePresentation,mindMapNodeRole,type DiagramDocument,type DiagramStructure} from '@edgeever/shared';
export const themeNames:Record<string,string>={plain:'素白',brand:'森林',cosmos:'宇宙',dune:'沙丘',slate:'岩灰',prism:'棱镜',sunrise:'日出',marine:'海洋',blossom:'繁花',mint:'薄荷',macaron:'马卡龙',parchment:'纸间',studio:'工作室'};
export const structureNames:Record<string,string>={map:'思维导图',line:'线条',capsule:'胶囊',box:'方框',circle:'圆形',ellipse:'椭圆',hexagon:'六边形',logic:'逻辑图',brace:'括号图',org:'组织图',tree:'树形图',timeline:'时间线',fishbone:'鱼骨图'};
export function restructure(document:DiagramDocument,structure:DiagramStructure):DiagramDocument {
 const resized={...document,structure,nodes:document.nodes.map(n=>{const {width,height}=mindMapNodePresentation(n.label,mindMapNodeRole(document.nodes,n.id),structure);return {...n,width,height};})};
 const positions=computeDiagramLayout(resized);
 return {...resized,nodes:resized.nodes.map(n=>({...n,...positions[n.id]}))};
}
export const thumbnailDocument:DiagramDocument=restructure({schemaVersion:1,kind:'mind-map',nodes:[{id:'root',label:'想法',x:0,y:0,width:100,height:40,shape:'topic'},...['计划','灵感','行动','记录'].map((label,i)=>({id:`n${i}`,parentId:'root',label,x:0,y:0,width:80,height:32,shape:'topic' as const}))],edges:[0,1,2,3].map(i=>({id:`e${i}`,source:'root',target:`n${i}`}))},'map');
