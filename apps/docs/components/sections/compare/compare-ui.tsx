import React from 'react'
import { SectionHeader } from '../section-header'
import { Compare } from '@/components/ui/compare'
import { Icons } from '@/components/icons'

const CompareUISection = ({ competitorName, competitorLogo }: { competitorName: string, competitorLogo: string }) => {
  return (
    <section
      className="flex flex-col items-center justify-center w-full relative px-5 md:px-10"
    >
      <div className="border-x mx-5 md:mx-10 relative w-max">
        <div className="absolute top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-white/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]"></div>
        <div className="absolute top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-white/5 bg-size-[10px_10px] bg-[repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]"></div>

        <SectionHeader>
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
            QRdx is supercharged with customisations powers!
          </h2>
        </SectionHeader>
        
        <div className='w-full select-none'>
          <div className='isolate w-full overflow-hidden rounded-2xl border bg-secondary'>
              <div className="flex items-center justify-between rounded-t-2xl border-b border-border bg-secondary px-4 py-2.5">
                  <Icons.logo className="size-6" />
                  <span className="text-sm text-muted-foreground">vs.</span>
                  <img src={competitorLogo} alt={competitorName} className="size-6 rounded-full" />
              </div>
              <Compare 
                  slideMode='drag' 
                  className='w-full h-full aspect-video' 
                  firstImage='https://storage.googleapis.com/bucket-fi-production-apps-0672ab2d/original/images/lwtiquxgha5pk5oe91o9u86e.png'
                  secondImage='https://storage.googleapis.com/bucket-fi-production-apps-0672ab2d/original/images/bdvu5ufmsw5huz1dh95er0av.png'
              />
          </div>
        </div>

      </div>
      
    </section>
  )
}

export default CompareUISection
