import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

const SITE = 'https://read.redaktorskaya.date';
const INDEX = `${SITE}/contents/wine/`;

class RedaktorskayaWinePlugin implements Plugin.PluginBase {
  id = 'redaktorskayaWine';
  name = 'Redaktorskaya — Поднося вино';
  icon = 'src/ru/redaktorskayaWine/icon.png';
  site = SITE;
  version = '1.0.0';
  filters: Filters | undefined = undefined;

  resolveUrl(path: string, _isNovel?: boolean): string {
    try {
      return new URL(path, SITE).toString();
    } catch {
      return INDEX;
    }
  }

  private async getHtml(url: string): Promise<string> {
    const response = await fetchApi(url, {
      headers: {
        Referer: INDEX,
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      },
    });
    return response.text();
  }

  private async getNovelItem(): Promise<Plugin.NovelItem> {
    const html = await this.getHtml(INDEX);
    const $ = loadCheerio(html);
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('img').first().attr('src');

    return {
      name: 'Поднося вино',
      path: INDEX,
      cover: image ? this.resolveUrl(image) : defaultCover,
    };
  }

  async popularNovels(
    _pageNo: number,
    _options: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    return [await this.getNovelItem()];
  }

  async searchNovels(
    searchTerm: string,
    _pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = searchTerm.trim().toLocaleLowerCase();
    if (
      !query ||
      'поднося вино 将进酒 тан цзюин redaktorskaya'.includes(query) ||
      query.includes('поднося') ||
      query.includes('вино')
    ) {
      return [await this.getNovelItem()];
    }
    return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.resolveUrl(novelPath || INDEX);
    const html = await this.getHtml(url);
    const $ = loadCheerio(html);
    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('img').first().attr('src');

    const chapters: Plugin.ChapterItem[] = [];
    const seen = new Set<string>();

    // The contents page links to each chapter using /read/<slug>/.
    $('a[href*="/read/"]').each((index, element) => {
      const anchor = $(element);
      const href = anchor.attr('href');
      const name = anchor.text().replace(/\s+/g, ' ').trim();
      if (!href || !name) return;

      const chapterUrl = this.resolveUrl(href);
      if (seen.has(chapterUrl)) return;
      seen.add(chapterUrl);

      const numberMatch = name.match(/Глава\s*(\d+(?:\.\d+)?)/i);
      chapters.push({
        name,
        path: chapterUrl,
        chapterNumber: numberMatch ? Number(numberMatch[1]) : index,
        releaseTime: '',
      });
    });

    if (chapters.length === 0) {
      throw new Error('На странице оглавления не найдены ссылки на главы.');
    }

    return {
      path: url,
      name: $('h1').first().text().trim() || 'Поднося вино',
      cover: image ? this.resolveUrl(image) : defaultCover,
      author: 'Тан Цзюин',
      artist: '',
      genres: 'Данмэй, Историческое, Романтика',
      status: NovelStatus.Completed,
      summary:
        $('meta[name="description"]').attr('content') ||
        'Русский перевод романа «Поднося вино» (将进酒). Перевод канала BLPlace.',
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const html = await this.getHtml(this.resolveUrl(chapterPath));
    const $ = loadCheerio(html);

    // Remove site chrome and non-reading elements without stripping article text.
    $('script, style, nav, header, footer, form, .comments, .share, .social-share').remove();

    const selectors = [
      'article',
      'main',
      '[itemprop="articleBody"]',
      '.entry-content',
      '.post-content',
      '.reader-content',
      '.chapter-content',
      '.content',
    ];

    let bestHtml = '';
    let bestLength = 0;
    for (const selector of selectors) {
      const candidate = $(selector).first();
      const text = candidate.text().trim();
      if (candidate.length && text.length > bestLength) {
        bestLength = text.length;
        bestHtml = candidate.html() || '';
      }
    }

    if (bestLength < 200) {
      throw new Error(
        'Не удалось уверенно определить текст главы: разметка сайта могла измениться.',
      );
    }

    return bestHtml;
  }
}

export default new RedaktorskayaWinePlugin();
