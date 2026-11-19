import { ImageResponse } from 'next/og';
export const runtime='nodejs';
export const alt='ARA Agency — SEO, GEO and a better digital presence';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function Image(){return new ImageResponse(<div style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',padding:'75px',background:'linear-gradient(120deg,#101110,#24201c)',fontFamily:'sans-serif',color:'#f6f6f0'}}><div style={{fontSize:60,fontWeight:800,marginBottom:60}}>a.r.a</div><div style={{display:'flex',flexDirection:'column',fontSize:80,fontWeight:800,lineHeight:1.1}}><span>Your next customer</span><span>is searching.</span></div><div style={{fontSize:30,color:'#ff7633',marginTop:40}}>SEO. GEO. A better digital presence.</div></div>,size);}
