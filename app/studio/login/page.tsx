import { redirect } from 'next/navigation';
import { getStudioSession } from '@/src/server/studio/context';
import { studioConfig } from '@/src/server/studio/transport';
import { LoginForm } from '@/components/studio/Forms';
export default async function LoginPage(){
 if(await getStudioSession())redirect('/studio');
 const configured=!!studioConfig();
 return <main id="main" className="studio-login"><div className="studio-login-story"><a className="studio-brand" href="/"><b>a.r.a</b><span>STUDIO</span></a><span className="studio-kicker">From first impression to next opportunity</span><h1>Considered work.<br/>A connected studio.</h1><p>The private workspace for ARA’s prospect research, client conversations and future projects.</p><span className="studio-login-note">Built for the people behind the work.</span></div><div className="studio-login-panel"><span className="studio-kicker">Staff sign-in</span><h2>Welcome to Studio.</h2><p>Use your provisioned staff account. Registration is managed by an administrator.</p>{configured?<LoginForm/>:<div className="studio-notice" role="status"><strong>Studio setup is required.</strong><p>The ARA database and staff accounts have not been connected. Access stays closed until an administrator completes the setup in <code>docs/studio-setup.md</code>.</p></div>}<a className="studio-text-link" href="/">Back to ARA Agency</a></div></main>;
}
