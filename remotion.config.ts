import { Config } from '@remotion/cli/config';

Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setChromiumHeadlessMode(true);
Config.setShouldOpenBrowser(false);
