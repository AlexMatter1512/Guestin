import {createFileRoute,redirect} from "@tanstack/react-router";
export const Route=createFileRoute("/beta")({beforeLoad:()=>{throw redirect({href:"/get-started",statusCode:301})}});
