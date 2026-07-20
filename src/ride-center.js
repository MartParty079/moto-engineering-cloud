import { supabase } from './supabase.js';

const mph = mps => Number.isFinite(mps) ? mps * 2.236936 : 0;
const ft = meters => Number.isFinite(meters) ? meters * 3.28084 : null;
const fmtTime = seconds => `${String(Math.floor(seconds / 3600)).padStart(2,'0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
const timeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out.`)), ms))
]);

let session = null;
let bikes = [];
let rides = [];
let active = null;
let starting = false;
let watchId = null;
let timerId = null;
let flushTimerId = null;
let lastPos = null;
let gpsError = '';
let distanceMi = 0;
let maxSpeed = 0;
let speedSum = 0;
let speedCount = 0;
let samples = [];
let flushing = false;

function bikeName(bike){
  return [bike?.year,bike?.make,bike?.model].filter(Boolean).join(' ') || bike?.name || 'Motorcycle';
}

function hav(a,b){
  const R = 3958.7613;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

function rideState(){
  const point = active?.latest || {};
  const elapsed = active ? Math.max(0,Math.floor((Date.now() - active.startMs) / 1000)) : 0;
  return {
    active:Boolean(active),
    starting,
    bikeId:active?.bike?.id || null,
    bikeName:active?.bike_name || null,
    sessionId:active?.id || null,
    elapsedSeconds:elapsed,
    elapsedText:fmtTime(elapsed),
    distanceMiles:distanceMi,
    speedMph:Number.isFinite(point.speed) ? point.speed : null,
    averageSpeedMph:speedCount ? speedSum / speedCount : 0,
    maxSpeedMph:maxSpeed,
    heading:Number.isFinite(point.heading) ? point.heading : null,
    altitudeFt:Number.isFinite(point.altitude) ? ft(point.altitude) : null,
    accuracyFt:Number.isFinite(point.accuracy) ? ft(point.accuracy) : null,
    latitude:point.latitude ?? null,
    longitude:point.longitude ?? null,
    gpsLocked:Boolean(active?.latest),
    gpsError:gpsError || null
  };
}

function rideHistory(){
  return rides.map(ride => ({
    id:ride.id,
    bikeId:ride.bike_id || null,
    bikeName:ride.bike_name || 'Motorcycle',
    startedAt:ride.started_at || null,
    endedAt:ride.ended_at || null,
    durationSeconds:Number(ride.duration_seconds || 0),
    distanceMiles:Number(ride.distance_miles || 0),
    maxSpeedMph:Number(ride.max_speed_mph || 0),
    averageSpeedMph:Number(ride.average_speed_mph || 0),
    status:ride.status || 'complete'
  }));
}

function publish(){
  const state = rideState();
  window.MotoRideState = state;
  window.dispatchEvent(new CustomEvent('moto-ride-state',{detail:state}));
  return state;
}

function publishRides(){
  const history = rideHistory();
  window.MotoRideHistory = history;
  window.dispatchEvent(new CustomEvent('moto-rides-update',{detail:history}));
  return history;
}

async function loadData(){
  const {data:{session:nextSession}} = await supabase.auth.getSession();
  session = nextSession;
  if(!session){
    bikes = [];
    rides = [];
    publishRides();
    publish();
    return;
  }

  const [bikeResult,rideResult] = await Promise.all([
    supabase.from('bikes').select('*').order('created_at'),
    supabase.from('ride_sessions').select('*').order('started_at',{ascending:false}).limit(40)
  ]);
  bikes = bikeResult.data || [];
  rides = rideResult.data || [];
  publishRides();
  publish();
}

function cleanupRuntime(){
  if(watchId !== null){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  clearInterval(timerId);
  clearInterval(flushTimerId);
  timerId = null;
  flushTimerId = null;
}

async function beginRide(bikeId){
  if(starting || active) return rideState();
  if(!session){
    const {data:{session:current}} = await supabase.auth.getSession();
    session = current;
  }
  if(!session) throw new Error('Sign in before starting a ride.');

  const bike = bikes.find(item => String(item.id) === String(bikeId));
  if(!bike) throw new Error('Motorcycle not found.');
  if(!navigator.geolocation) throw new Error('GPS is unavailable.');

  starting = true;
  gpsError = '';
  publish();
  cleanupRuntime();

  try{
    const result = await timeout(
      supabase.from('ride_sessions').insert({
        user_id:session.user.id,
        bike_id:bike.id,
        bike_name:bikeName(bike),
        status:'recording'
      }).select().single(),
      15000,
      'Ride session'
    );
    if(result.error) throw result.error;

    active = {...result.data,bike,startMs:Date.now(),latest:null};
    localStorage.setItem('motoActiveRide',JSON.stringify({id:active.id,bikeId:bike.id,startedAt:active.startMs}));
    distanceMi = 0;
    maxSpeed = 0;
    speedSum = 0;
    speedCount = 0;
    lastPos = null;
    samples = [];

    watchId = navigator.geolocation.watchPosition(onPosition,onGpsError,{
      enableHighAccuracy:true,
      maximumAge:1500,
      timeout:20000
    });
    timerId = setInterval(publish,1000);
    flushTimerId = setInterval(() => void flushSamples(),10000);
    publish();
    return rideState();
  }catch(error){
    console.error('Ride start failed',error);
    cleanupRuntime();
    active = null;
    localStorage.removeItem('motoActiveRide');
    throw error;
  }finally{
    starting = false;
    publish();
  }
}

function onGpsError(error){
  gpsError = error?.message || 'GPS signal unavailable.';
  publish();
}

function onPosition(position){
  if(!active) return;
  const coordinates = position.coords;
  const point = {latitude:coordinates.latitude,longitude:coordinates.longitude};

  if(lastPos && Number.isFinite(coordinates.accuracy) && coordinates.accuracy < 80){
    const delta = hav(lastPos,point);
    if(Number.isFinite(delta) && delta >= 0 && delta < .5) distanceMi += delta;
  }
  lastPos = point;

  const speed = mph(coordinates.speed);
  if(speed >= 0 && speed < 250){
    maxSpeed = Math.max(maxSpeed,speed);
    speedSum += speed;
    speedCount += 1;
  }

  gpsError = '';
  active.latest = {
    ...point,
    altitude:coordinates.altitude,
    accuracy:coordinates.accuracy,
    speed,
    heading:coordinates.heading,
    timestamp:position.timestamp
  };

  samples.push({
    session_id:active.id,
    user_id:session.user.id,
    recorded_at:new Date(position.timestamp || Date.now()).toISOString(),
    latitude:coordinates.latitude,
    longitude:coordinates.longitude,
    altitude_m:coordinates.altitude ?? null,
    accuracy_m:coordinates.accuracy ?? null,
    speed_mps:Number.isFinite(coordinates.speed) ? coordinates.speed : null,
    heading_deg:coordinates.heading ?? null
  });
  if(samples.length >= 10) void flushSamples();
  publish();
}

async function flushSamples(){
  if(flushing || !samples.length) return;
  flushing = true;
  const rows = samples.splice(0);
  try{
    const {error} = await supabase.from('ride_samples').insert(rows);
    if(error) throw error;
  }catch(error){
    console.error('Sample save failed',error);
    samples.unshift(...rows.slice(-100));
  }finally{
    flushing = false;
  }
}

async function stopRide(confirmFirst = false){
  if(!active) return rideState();
  if(confirmFirst && !confirm('Stop and save this ride?')) return rideState();

  cleanupRuntime();
  await flushSamples();

  const duration = Math.floor((Date.now() - active.startMs) / 1000);
  const average = speedCount ? speedSum / speedCount : 0;
  const point = active.latest || {};
  const finished = active;
  const bike = active.bike;

  const {error:sessionError} = await supabase.from('ride_sessions').update({
    ended_at:new Date().toISOString(),
    duration_seconds:duration,
    distance_miles:distanceMi,
    max_speed_mph:maxSpeed,
    average_speed_mph:average,
    end_lat:point.latitude ?? null,
    end_lng:point.longitude ?? null,
    status:'complete',
    updated_at:new Date().toISOString()
  }).eq('id',active.id);
  if(sessionError) throw sessionError;

  await supabase.from('bikes').update({
    odometer:Number(bike.odometer || 0) + distanceMi,
    gps_odometer_miles:Number(bike.gps_odometer_miles || 0) + distanceMi,
    rides_since_odometer_confirm:Number(bike.rides_since_odometer_confirm || 0) + 1,
    updated_at:new Date().toISOString()
  }).eq('id',bike.id);

  localStorage.removeItem('motoActiveRide');
  active = null;
  gpsError = '';
  await loadData();
  publish();
  window.dispatchEvent(new CustomEvent('moto-ride-complete',{detail:{
    sessionId:finished.id,
    bikeId:bike.id,
    distanceMiles:distanceMi,
    durationSeconds:duration
  }}));
  return rideState();
}

function openUnifiedRide(){
  if(window.MotoRideDash?.open){
    window.MotoRideDash.open();
    return;
  }
  window.dispatchEvent(new CustomEvent('moto-ride-open-request'));
}

window.MotoRide = {
  getState:rideState,
  getBikes:() => bikes.map(bike => ({id:bike.id,name:bikeName(bike),odometer:Number(bike.odometer || 0)})),
  getRides:rideHistory,
  start:beginRide,
  stop:() => stopRide(false),
  open:openUnifiedRide,
  refresh:loadData
};

supabase.auth.onAuthStateChange(() => setTimeout(loadData,0));
loadData();