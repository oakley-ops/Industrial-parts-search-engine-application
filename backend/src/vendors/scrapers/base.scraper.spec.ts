import { chromium } from 'playwright';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() },
}));

const mockLaunch = chromium.launch as jest.Mock;

class TestScraper extends BaseScraper {
  readonly vendorSlug = 'test';
  readonly vendorName = 'Test';
  async search(): Promise<SearchResult[]> { return []; }
  async getPrice(): Promise<PriceResult> { return {} as PriceResult; }
  async callGetPage() { return this.getPage(); }
  async callClosePage(p: any) { return this.closePage(p); }
}

describe('BaseScraper browser lifecycle', () => {
  let scraper: TestScraper;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(() => {
    mockPage = { context: jest.fn() };
    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockPage.context.mockReturnValue(mockContext);
    mockBrowser = {
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockLaunch.mockResolvedValue(mockBrowser);
    scraper = new TestScraper();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('launches a browser on the first getPage() call', async () => {
    await scraper.callGetPage();
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it('reuses the same browser on subsequent calls', async () => {
    const page1 = await scraper.callGetPage();
    await scraper.callClosePage(page1);
    await scraper.callGetPage();
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it('re-launches the browser when disconnected', async () => {
    await scraper.callGetPage();
    mockBrowser.isConnected.mockReturnValue(false);
    await scraper.callGetPage();
    expect(mockLaunch).toHaveBeenCalledTimes(2);
  });

  it('closePage() closes the context but not the browser', async () => {
    const page = await scraper.callGetPage();
    await scraper.callClosePage(page);
    expect(mockContext.close).toHaveBeenCalledTimes(1);
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it('onApplicationShutdown() closes the browser', async () => {
    await scraper.callGetPage();
    await scraper.onApplicationShutdown();
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});
