import { MarketingPage } from '@/components/ara/MarketingPage';
import { metadataFor } from '@/src/metadata';
export const generateMetadata=()=>metadataFor('/work');
export default function Page(){return <MarketingPage path="/work"/>;}
