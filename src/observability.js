const dsn=import.meta.env.VITE_SENTRY_DSN?.trim();
const environment=import.meta.env.VITE_APP_ENV||import.meta.env.MODE||'development';
const release=import.meta.env.VITE_APP_RELEASE||document.querySelector('meta[name="motocloud-build"]')?.content||undefined;
const tracesSampleRate=Math.min(1,Math.max(0,Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE||0)));

function installFallbackReporting(){
  window.addEventListener('error',event=>{
    console.error('[Moto Mission] Unhandled browser error',event.error||event.message);
  });
  window.addEventListener('unhandledrejection',event=>{
    console.error('[Moto Mission] Unhandled promise rejection',event.reason);
  });
}

async function initializeObservability(){
  if(!dsn){
    installFallbackReporting();
    return;
  }

  try{
    const Sentry=await import(/* @vite-ignore */'https://esm.sh/@sentry/browser@8.47.0');
    Sentry.init({
      dsn,
      environment,
      release,
      tracesSampleRate,
      sendDefaultPii:false,
      beforeSend(event){
        if(event.request?.headers) delete event.request.headers.Authorization;
        return event;
      }
    });
    window.motoObservability={
      captureException:error=>Sentry.captureException(error),
      captureMessage:(message,level='info')=>Sentry.captureMessage(message,level)
    };
  }catch(error){
    console.error('[Moto Mission] Error monitoring failed to initialize',error);
    installFallbackReporting();
  }
}

initializeObservability();
