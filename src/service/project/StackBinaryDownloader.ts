import { RuntimeContext } from '@/service/project/RuntimeContext';
import { Exception } from '@/utils/Exception';
import { Logger } from '@/utils/Logger';
import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';


type Release = {
    name : string,
    tag_name : string,
    assets : Array<{
        name : string,
        browser_download_url : string,
    }>,
}


export class StackBinaryDownloader
{
    
    protected static readonly RELEASES_URL = 'https://api.github.com/repos/Phala-Network/phala-blockchain/releases';
    protected static readonly EXECUTABLES = [
        'phala-node',
        'pruntime',
        'pherry',
    ];
    
    
    protected _logger : Logger = new Logger(StackBinaryDownloader.name);
    
    
    public constructor (
        protected _context : RuntimeContext
    )
    {}
    
    public static async uniformStackVersion (version : string) : Promise<string>
    {
        if (version === 'latest') {
            const releases = await this.getReleases();
            return releases[0].tag_name;
        }
        
        return version;
    }
    
    public static async getReleases () : Promise<Release[]>
    {
        const { status, data } = await axios.get(
            StackBinaryDownloader.RELEASES_URL,
            { validateStatus: () => true, }
        );
        
        if (status !== 200) {
            throw new Exception(
                'Unable to fetch releases list',
                1668571559267
            );
        }
        
        return data;
    }
    
    public async findRelease (tagName : string) : Promise<Release>
    {
        const releases = await StackBinaryDownloader.getReleases();
        const targetRelease = releases.find(release => release.tag_name === tagName);
        
        if (!targetRelease) {
            throw new Exception(
                `Unable to find target ${tagName} release`,
                1668572613089
            );
        }
        
        return targetRelease;
    }
    
    public async download () : Promise<void>
    {
        const releaseStackPath = this._context.paths.currentStack;
        if (!fs.existsSync(releaseStackPath)) {
            this._logger.log('Creating stack directory');
            
            fs.mkdirSync(releaseStackPath, { recursive: true });
        }
        
        let needsDownload = !fs.existsSync(this._context.config.stack.node.binary);
        if (!needsDownload) {
            return;
        }
        
        // find release
        const release = await this.findRelease(this._context.config.stack.version);
        
        // download assets
        this._logger.log(
            'Downloading stack binaries',
            chalk.cyan(release.name)
        );
        
        for (const asset of release.assets) {
            const isBinary = StackBinaryDownloader.EXECUTABLES.includes(asset.name);
            
            const filePath = path.join(
                releaseStackPath,
                asset.name
            );
            if (fs.existsSync(filePath)) {
                continue;
            }
            
            this._logger.log(
                isBinary
                    ? chalk.greenBright(asset.name)
                    : chalk.blueBright(asset.name)
            );
            
            const { status, data } = await axios.get(
                asset.browser_download_url,
                {
                    responseType: 'arraybuffer',
                    headers: {
                        'Content-Type': 'application/gzip'
                    },
                    validateStatus: () => true,
                }
            );
            if (status !== 200) {
                throw new Exception(
                    'Unable to download release',
                    1668572702020
                );
            }
            
            fs.writeFileSync(filePath, data, { encoding: 'binary' });
            
            // make binary executable
            if (isBinary) {
                fs.chmodSync(filePath, 0o755);
            }
        }
    }
    
}
