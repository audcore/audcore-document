const sidechainSuffix=' · 侧链';

function channelTarget(channels,send) {
  const sidechain=send.endsWith(sidechainSuffix);
  const name=sidechain?send.slice(0,-sidechainSuffix.length):send;
  return {target:channels.find(channel=>channel.name===name),sidechain};
}

export function canSendTo(channels,source,target) {
  const visited=new Set();
  function reachesSource(channel) {
    if(channel.id===source.id)return true;
    if(visited.has(channel.id))return false;
    visited.add(channel.id);
    return channel.sends.some(send=>{
      const next=channelTarget(channels,send).target;
      return next&&reachesSource(next);
    });
  }
  return !reachesSource(target);
}

function sourceAmplitude(role,time,side) {
  if(role==='music') {
    const phase=((time*2.1)%1+1)%1;
    const beat=Math.exp(-5*phase);
    const groove=Math.sin(time*8.2+side*.85)**2;
    return .12+.28*beat+.09*groove;
  }
  if(role==='microphone') {
    const phrase=Math.max(0,Math.sin(time*1.39+.25));
    const syllable=Math.max(0,Math.sin(time*10.7)+.28*Math.sin(time*19.3));
    return .57*phrase*syllable;
  }
  return 0;
}

const activeEffect=(channel,name)=>!channel.bypass&&channel.fx.includes(name)&&!channel.bypassed.includes(name);

// Evaluate the same sends drawn in the mixer. Values are independent RMS envelopes,
// so mixing sums power. Earlier samples approximate the wet-only reverb decay.
export function channelAmplitudes({channels,solo},time) {
  const inputs=channels.map(()=>({audio:[],sidechain:[]}));
  for(const source of channels) {
    for(const send of source.sends) {
      const {target,sidechain}=channelTarget(channels,send);
      if(target)inputs[target.id][sidechain?'sidechain':'audio'].push(source.id);
    }
  }
  const cache=new Map();
  const resolving=new Set();
  function output(id,delay) {
    const key=id+':'+delay;
    if(cache.has(key))return cache.get(key);
    const channel=channels[id];
    if(channel.mute||resolving.has(id))return [0,0];
    resolving.add(id);
    const input=at=>{
      const sourceTime=time-at*.09;
      const own=[0,1].map(side=>sourceAmplitude(channel.role,sourceTime,side));
      for(const origin of inputs[id].audio) {
        const signal=output(origin,at);
        for(let side=0;side<2;side++)own[side]=Math.hypot(own[side],signal[side]);
      }
      return own;
    };
    let amplitude=input(delay);
    if(activeEffect(channel,'组合混响')) {
      amplitude=[0,0];
      for(const [offset,weight] of [[1,.48],[2,.35],[3,.25],[5,.16],[7,.09]]) {
        const reflection=input(delay+offset);
        for(let side=0;side<2;side++)amplitude[side]=Math.hypot(amplitude[side],reflection[side]*weight);
      }
    }
    let gain=10**(channel.gain/20);
    if(activeEffect(channel,'伴奏融合')) {
      const detector=Math.hypot(...inputs[id].sidechain.map(origin=>Math.max(...output(origin,delay))));
      gain/=1+3*detector;
    }
    const limited=activeEffect(channel,'输出限制');
    const result=amplitude.map(value=>limited?Math.min(.9,value*gain):value*gain);
    resolving.delete(id);
    cache.set(key,result);
    return result;
  }
  return channels.map(channel=>solo!=null&&solo!==channel.id?[0,0]:output(channel.id,0));
}

export function meterPosition(amplitude) {
  return amplitude>0?Math.max(0,Math.min(1,(20*Math.log10(amplitude)+60)/72)):0;
}
