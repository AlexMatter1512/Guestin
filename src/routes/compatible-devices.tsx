import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/compatible-devices")({beforeLoad:()=>{throw redirect({href:"/docs/",statusCode:301})}});
