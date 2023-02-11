import {Zhin} from "./zhin";
import {Bot} from "./bot";
import Element from './element'
import {Session} from "./session";
import {Dict} from "./types";
export class Prompt{
    private readonly fullTargetId:string
    constructor(private bot:Bot<keyof Zhin.Bots,any,any>,private session:Session,public timeout:number) {
        this.fullTargetId=Bot.getFullTargetId(session)
    }
    async prompts<O extends Prompt.Options>(options:O):Promise<Prompt.ResultS<O>>{
        let result:Prompt.ResultS<O>={} as Prompt.ResultS<O>
        const names=Object.keys(options)
        for(const name of names){
            result[name as keyof O]=await this[options[name].type as any](options[name].message,options[name])
        }
        return result
    }
    private async $prompt<T extends keyof Prompt.Types,CT extends keyof Prompt.BaseTypes,M extends boolean=false>(options:Prompt.Option<T,CT,M>){
        await this.session.reply(options.message)
        return new Promise<Prompt.Result<T, CT, M>>((resolve)=>{
            try{
                const dispose = this.session.middleware(async (session) => {
                    resolve(options.format(session))
                    dispose()
                    clearTimeout(timer)
                })
                const timer = setTimeout(() => {
                    this.session.reply('输入超时')
                    resolve(options.initial)
                }, this.timeout)
            }catch (e){
                this.session.reply(e.message)
                resolve(options.initial)
            }
        })
    }
    text(message:Element.Fragment='请输入文本',initial=''){
        return this.$prompt({
            type:'text',
            message,
            initial,
            format:Prompt.transforms['text']
        })
    }
    number(message:Element.Fragment='请输入数值',initial=0){
        return this.$prompt({
            type:'number',
            message,
            initial,
            format:Prompt.transforms['number'],
        })
    }
    date(message:Element.Fragment='请输入日期',initial=new Date()){
        return this.$prompt({
            type:'date',
            message,
            initial,
            format:Prompt.transforms['date'],
        })
    }
    regexp(message:Element.Fragment='请输入正则',initial=/.+/){
        return this.$prompt({
            type:'regexp',
            message,
            initial,
            format:Prompt.transforms['regexp'],
        })
    }
    confirm(message:Element.Fragment='确认么？',initial:boolean=false){
        return this.$prompt({
            type:'confirm',
            message:`${message}\n输入${['yes','y','Yes','YES','Y','.','。','确认'].join()}为确认`,
            initial,
            format:Prompt.transforms['confirm']
        })
    }
    list<T extends keyof Prompt.BaseTypes>(message:Element.Fragment='请输入',config:Prompt.Option<'list',T>){
        return this.$prompt({
            type:'list',
            message:`${message}\n值之间使用'${config.separator||','}'分隔`,
            initial:config.initial||[],
            child_type:config.child_type,
            format(event){
                return Prompt.transforms['list'][config.child_type](event,config.separator||',')
            }
        })
    }
    toJSON(){
        return {
            fullTargetId:this.fullTargetId,
            timeout:this.timeout
        }
    }
    select<T extends keyof Prompt.BaseTypes,M extends boolean>(message:Element.Fragment='请选择',config:Prompt.Option<'select',T,M>){
        const options:Prompt.Option<'select',T,M>={
            type:'select',
            ...config,
            message:`${message}\n${config.options.map((option,index)=>{
                return `${index+1}:${option.label}`
            }).join('\n')}${config.multiple?`\n选项之间使用'${config.separator||','}'分隔`:''}`,
            format:(event)=> {
                const firstElem = event.elements[0]
                const chooseIdxArr = (firstElem.attrs.text).split(config.separator || ',').map(Number)
                return Prompt.transforms['select'][config.child_type][config.multiple ? 'true' : 'false'](event, config.options, chooseIdxArr) as Prompt.Select<T, M>
            }
        }
        return this.$prompt(options)
    }
}
export namespace Prompt{
    export interface BaseTypes{
        text:string
        number:number
        confirm:boolean
        regexp:RegExp
        date:Date
    }
    export interface QuoteTypes<T extends keyof BaseTypes=keyof BaseTypes,M extends boolean=false>{
        list:List<T>
        select:Select<T,M>
    }
    export interface Types<CT extends keyof BaseTypes=keyof BaseTypes,M extends boolean=false> extends BaseTypes,QuoteTypes<CT,M>{
    }
    export type Result<T extends keyof Types,CT extends keyof BaseTypes,M extends boolean>=T extends 'select'?Select<CT,M>:T extends 'list'?Array<BaseTypes[CT]>:Types[T]
    export type List<T extends keyof BaseTypes=keyof BaseTypes>=Array<BaseTypes[T]>
    export type Select<T extends keyof BaseTypes=keyof BaseTypes,M extends boolean=false>=M extends true?Array<BaseTypes[T]>:BaseTypes[T]
    export type Option<T extends keyof Types=keyof Types,CT extends keyof BaseTypes=keyof BaseTypes,M extends boolean=false> = {
        message?:Element.Fragment
        type?:T
        child_type?:CT
        multiple?:T extends 'select'?M:boolean
        initial?:Result<T, CT, M>
        timeout?:number
        format?:(session:Session)=>Result<T, CT, M>
        validate?:(value:Types[T],...args:any[])=>boolean
        separator?:string
        options?:T extends 'select'?Prompt.SelectOption<CT>[]:never
    }
    export interface Options{
        [key:string]:Option
    }
    export type ResultS<S extends Dict>={
        [T in keyof S]:ResultItem<S[T]>
    }
    export type ResultItem<O>= O extends Option<infer T,infer CT,infer M>?Result<T, CT, M>:unknown
    export interface SelectOption<T extends keyof BaseTypes>{
        label:Element.Fragment
        value:BaseTypes[T]
    }
    export  type Transforms<CT extends keyof BaseTypes= keyof BaseTypes,M extends boolean=false>={
        [P in keyof Types]?:Transform<P>
    }
    export type Transform<T extends keyof Types>= T extends keyof QuoteTypes?QuoteTransform<T>:(session:Session)=>Types[T]
    export type QuoteTransform<T extends keyof Types>=T extends 'select'?SelectTransform:
        T extends 'list'?ListTransform:
            unknown
    export type SelectTransform={
        [P in keyof BaseTypes]?:{
            true?:(session:Session,options:Array<SelectOption<P>>,chooseArr:number[])=>Array<BaseTypes[P]>
            false?:(session:Session,options:Array<SelectOption<P>>,chooseArr:number[])=>BaseTypes[P]
        }
    }
    export type ListTransform={
        [P in keyof BaseTypes]?:(session:Session,separator:string)=>Array<BaseTypes[P]>
    }
    export const transforms:Transforms={}
    export function defineTransform<T extends keyof Types,CT extends keyof BaseTypes=keyof BaseTypes,M extends boolean=false>(type:T,transform:Transforms[T]){
        transforms[type]=transform
    }
    defineTransform("number",(session)=>{
        const firstElem=session.elements[0]
        if(firstElem.type!=='text' || !/^[0-9]*$/.test(firstElem.attrs.text)) throw new Error('type Error')
        return +firstElem.attrs.text
    })
    defineTransform('text',(session)=>{
        const firstElem=session.elements[0]
        if(firstElem.type!=='text') throw new Error('type Error')
        return firstElem.attrs.text
    })
    defineTransform('confirm',(session)=>{
        const firstElem=session.elements[0]
        if(firstElem.type!=='text') throw new Error('type Error')
        return ['yes','y','Yes','YES','Y','.','。','确认'].includes(firstElem.attrs.text)
    })
    defineTransform("regexp", (session)=>{
        const firstElem=session.elements[0]
        if(firstElem.type!=='text') throw new Error('type Error')
        return new RegExp(firstElem.attrs.text)
    })
    defineTransform('date',(session)=>{
        const firstElem=session.elements[0]
        if(firstElem.type!=='text') throw new Error('type Error')
        return new Date(firstElem.attrs.text)
    })
    defineTransform('list',{
        date(session,separator){
            const firstElem=session.elements[0]
            return firstElem.attrs.text?.split(separator).map(str=>{
                if(/^[0-9]$/g.test(str)) return new Date(+str)
                return new Date(str)
            })
        },
        number(session,separator){
            const firstElem=session.elements[0]
            return firstElem.attrs.text?.split(separator).map(str=>{
                if(!/^[0-9]$/g.test(str))throw new Error('type Error')
                return +str
            })
        },
        text(session,separator){
            const firstElem=session.elements[0]
            return firstElem.attrs.text?.split(separator)
        },
        regexp(session,separator){
            const firstElem=session.elements[0]
            return firstElem.attrs.text?.split(separator).map(str=>{
                return new RegExp(str)
            })
        }
    })
    defineTransform('select',{
        date:{
            true(event,options,choose){
                return options.filter((_,index)=>choose.includes(index+1))
                    .map(option=>option.value)
            },
            false(event,options,choose){
                return options[choose?.[0]-1]?.value
            }
        },
        number:{
            true(event,options,choose){
                return options.filter((_,index)=>choose.includes(index+1))
                    .map(option=>option.value)
            },
            false(event,options,choose){
                return options[choose?.[0]-1]?.value
            }
        },
        text:{
            true(event,options,choose){
                return options.filter((_,index)=>choose.includes(index+1))
                    .map(option=>option.value)
            },
            false(event,options,choose){
                return options[choose?.[0]-1]?.value
            }
        },
        regexp:{
            true(event,options,choose){
                return options.filter((_,index)=>choose.includes(index+1))
                    .map(option=>option.value)
            },
            false(event,options,choose){
                return options[choose?.[0]-1]?.value
            }
        }
    })
}