import './globals.css'

import type { Viewport } from 'next'

import { HydrationEndDetector } from '~/components/common/HydrationEndDetector'
import { ScrollTop } from '~/components/common/ScrollTop'
import { NocturneBackground } from '~/components/landing/NocturneBackground'
import { Footer } from '~/components/layout'
import { PageHeader } from '~/components/layout/PageHeader'
import { Root } from '~/components/layout/root/Root'
import { sansFont, serifFont } from '~/lib/fonts'

import { Providers } from '../providers/root'
import { ClientInit } from './ClientInit'
import { init } from './init'
import { InitInClient } from './InitInClient'

init()

export function generateViewport(): Viewport {
  return {
    themeColor: [
      { media: '(prefers-color-scheme: dark)', color: '#000212' },
      { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    ],
  }
}

export const generateMetadata = async () => {
  const url = {
    webUrl: 'https://afilmory.art',
  }
  const seo = {
    title: 'Afilmory',
    description:
      'Afilmory 致力于为摄影师、策展人和品牌打造沉浸的展示体验。我们以黑色背景延展出一条长廊，观众在其中聆听故事，而非参数。',
    keywords: [
      'Afilmory',
      '照片画廊',
      '摄影作品集',
      '图片托管',
      '照片展示',
      'photo gallery',
      'image hosting',
      'photography',
    ],
  }
  return {
    metadataBase: new URL(url.webUrl),
    title: {
      template: `%s - ${seo.title}`,
      default: seo.title,
    },
    description: seo.description,
    keywords: seo.keywords?.join(',') || '',
    icons: [],

    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      title: {
        default: seo.title,
        template: `%s | ${seo.title}`,
      },
      description: seo.description,
      siteName: seo.title,
      locale: 'zh_CN',
      type: 'website',
      url: url.webUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
    },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <ClientInit />
      <html lang="zh-CN" suppressHydrationWarning>
        <head>
          <HydrationEndDetector />
        </head>
        <body
          className={`${sansFont.variable} ${serifFont.variable} m-0 h-full p-0 font-sans`}
        >
          <Providers>
            <div data-theme>
              <Root>
                <NocturneBackground />
                <PageHeader />
                {children}
                <Footer />
              </Root>
            </div>
          </Providers>

          <ScrollTop />
          <InitInClient />
        </body>
      </html>
    </>
  )
}
