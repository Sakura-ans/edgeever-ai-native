// One public error contract for main, renderer and SDK boundaries. Never expose
// arbitrary exception messages, paths, provider response bodies or credentials.
export const ERROR_CATALOG = Object.freeze({
 RUNTIME_FAILURE:['应用运行中断，请重新打开，并检查未保存草稿的恢复提示。','none'],
 SDK_MISSING:['AI 运行组件不完整，请重新安装完整安装包。现有导图仍保留在本机。','none'],
 APP_LOAD:['应用资源无法加载，请重新安装完整安装包；本机导图不会因此被删除。','none'],
 DESKTOP_REQUIRED:['请从 EdgeEver Mind 桌面应用打开此工作台。','none'],
 AI_LIMIT:['已达到本次 AI 请求的步骤或输出上限，未自动修改导图。请缩小请求范围后重试。','retry'],
 UNKNOWN:['操作未完成。请保留当前内容，稍后重试；如持续出现，请提供错误代码。','retry'],
 DISK_FULL:['磁盘空间不足，内容未保存。请释放空间后重试保存草稿。','retry'],
 PERMISSION:['没有读写权限，操作未完成。请检查工作区或目标文件夹权限。','retry'],
 IO:['本机文件读写失败，操作未完成。请检查磁盘后重试。','retry'],
 WORKSPACE_READ:['无法读取本机工作区。原文件未被覆盖，请检查权限或从有效备份恢复。','reload'],
 INVALID_BACKUP:['备份内容无效或格式不支持，现有导图未改变。请选择有效的导图备份。','import'],
 TOO_LARGE:['工作区或备份超过 8 MB 限制，请减少内容后再操作。','none'],
 INVALID_MAP:['导图格式无效，修改未应用。请检查节点、连线和结构。','none'],
 INVALID_PARENT:['不能移动到自身、后代或不存在的主题，也不能移动中心主题。','none'],
 TITLE_REQUIRED:['导图名称不能为空或只有空白。请填写名称后保存。','none'],
 TITLE_LONG:['导图名称不能超过 200 个字符（按 Unicode 码点计数）。','none'],
 CONFLICT:['导图版本已变化，修改未应用。请重新读取并核对保留的草稿，或重新请求 AI 提案。','reload'],
 DRAFT_PENDING:['仍有未保存草稿，请先重试保存或明确放弃草稿，再执行其他修改。','none'],
 WRITE_BLOCKED:['上次写入未完成，请先重新读取并核对本机内容，再执行修改。','reload'],
 DRAFT_TARGET:['草稿对应的导图或主题已不存在。请先复制草稿内容，再选择保留或放弃。','none'],
 INVALID_COMMAND:['操作参数无效，修改未应用。','none'],
 MAP_LIMIT:['导图数量已达到 500 个上限，请先导出备份并整理导图库。','none'],
 NO_HISTORY:['没有可撤销或重做的记录。','none'],
 PROPOSAL_LIMIT:['待确认提案过多，请先处理已有提案。','none'],
 NO_CHANGE:['没有实际变更，无需应用提案。','none'],
 PROPOSAL_EXPIRED:['提案已过期或已处理，请重新请求 AI 提案。','none'],
 SECURE_UNAVAILABLE:['操作系统安全存储不可用，无法保存或读取密钥。请检查系统凭据服务。','settings'],
 DECRYPT:['无法解密已保存的凭据。请在设置中删除失效凭据后重新配置。','settings'],
 CONFIG_INVALID:['模型标识或密钥格式不正确。请检查设置，模型标识最多 150 个字符。','settings'],
 CONFIG_REQUIRED:['尚未配置 DeepSeek 密钥和模型，请先打开设置。导图未改变。','settings'],
 UNTRUSTED:['此操作来源不受信任，已拒绝访问本机数据。','none'],
 AI_BUSY:['已有 AI 请求正在运行，请等待完成或停止当前请求。','stop'],
 PROMPT_INVALID:['请输入有效的 AI 请求，长度不能超过 10000 个字符。','none'],
 AI_STOPPED:['已停止 AI 请求，没有自动修改导图。已收到的提案仍须单独确认或拒绝。','none'],
 AI_TIMEOUT:['AI 请求超时，没有自动修改导图。请检查网络或稍后重试。','retry'],
 AI_AUTH:['提供方拒绝了凭据，请在设置中检查密钥和访问权限。导图未改变。','settings'],
 AI_RATE:['提供方请求过于频繁或额度受限，请稍后重试或检查账户额度。导图未改变。','retry'],
 AI_MODEL:['提供方不支持当前模型或请求参数，请检查模型配置。导图未改变。','settings'],
 AI_NETWORK:['无法连接 AI 提供方，请检查网络后重试。导图未改变。','retry'],
 AI_PROVIDER:['AI 提供方返回错误，没有自动修改导图。请稍后重试。','retry'],
 AI_TOOL:['AI 提案或工具参数无效，未应用任何修改。请调整请求后重试。','retry'],
 AI_CLEANUP:['AI 临时工作目录清理失败。请检查本机权限；不会因此自动应用提案。','none'],
});
export class MindError extends Error { constructor(code){super(`[MIND:${code}] ${ERROR_CATALOG[code]?.[0]??ERROR_CATALOG.UNKNOWN[0]}`);this.code=code;} }
export function userError(error, fallback='UNKNOWN') {
 const known=typeof error?.code==='string'&&ERROR_CATALOG[error.code]?error.code:typeof error?.message==='string'?error.message.match(/\[MIND:([A-Z_]+)\]/)?.[1]:undefined;
 let code=known&&ERROR_CATALOG[known]?known:null;
 if(!code){const native=error?.code;code=['ENOSPC','EDQUOT'].includes(native)?'DISK_FULL':['EACCES','EPERM','EROFS'].includes(native)?'PERMISSION':['EIO','EBUSY','ENOENT','ENOTDIR','EMFILE','ENFILE','ENAMETOOLONG'].includes(native)?'IO':fallback;}
 if(!ERROR_CATALOG[code])code='UNKNOWN';const [message,action]=ERROR_CATALOG[code];return {code,message,action};
}
export function providerError(error){
 if(['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND'].includes(error?.code))return new MindError('SDK_MISSING');
 if(error?.name==='TimeoutError')return new MindError('AI_TIMEOUT');
 const known=userError(error);if(known.code!=='UNKNOWN')return new MindError(known.code);
 // Prefer numeric transport metadata over the SDK's generic "unknown" label.
 const status=[error?.api_error_status,error?.status,error?.statusCode].find(value=>Number.isInteger(value)&&value>=400&&value<=599);
 const byStatus=[401,403].includes(status)?'AI_AUTH':status===429?'AI_RATE':[400,404,405,413,415,422].includes(status)?'AI_MODEL':status===408?'AI_TIMEOUT':status>=500?'AI_PROVIDER':undefined;
 const type=typeof error?.error==='string'?error.error:error?.error?.type??error?.type;
 const byType={authentication_failed:'AI_AUTH',authentication_error:'AI_AUTH',permission_error:'AI_AUTH',oauth_org_not_allowed:'AI_AUTH',account_on_hold:'AI_AUTH',verification_required:'AI_AUTH',cloud_credential_error:'AI_AUTH',billing_error:'AI_RATE',rate_limit:'AI_RATE',rate_limit_error:'AI_RATE',invalid_request:'AI_MODEL',invalid_request_error:'AI_MODEL',model_not_found:'AI_MODEL',not_found_error:'AI_MODEL',max_output_tokens:'AI_LIMIT',api_error:'AI_PROVIDER',overloaded_error:'AI_PROVIDER'}[type];
 const code=byStatus??byType??(['ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH'].includes(error?.code)?'AI_NETWORK':error?.name==='AbortError'?'AI_STOPPED':'AI_PROVIDER');return new MindError(code);
}
export function diagnostic(error,operation){const safe=userError(error);return {kind:['TypeError','SyntaxError','RangeError','Error'].includes(error?.name)?error.name:'Error',operation:String(operation).replace(/[^a-z-]/gi,'').slice(0,40),code:safe.code};}
export const titleProblem=value=>typeof value!=='string'||!value.trim()?'TITLE_REQUIRED':Array.from(value).length>200?'TITLE_LONG':null;
