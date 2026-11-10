import adapter from '@sveltejs/adapter-static';
const demo=process.env.GUESTIN_DEMO==='1';
export default {kit:{adapter:adapter({fallback:demo?'index.html':'200.html',pages:demo?'build-demo':'build',assets:demo?'build-demo':'build'}),paths:{base:demo?'/demo/guest':'/guest'},serviceWorker:{register:!demo}}};
