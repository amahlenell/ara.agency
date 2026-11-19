'use client';
import { motion } from 'motion/react';
export function PageEntrance({children}:{children:React.ReactNode}){return <motion.div initial={false} animate={{opacity:1}}>{children}</motion.div>;}
