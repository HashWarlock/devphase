import { VerbosityLevel } from '@/def';
import { RuntimeContext } from '@/service/project/RuntimeContext';
import { Logger } from '@/utils/Logger';
import chalk from 'chalk';
import childProcess from 'child_process';
import * as fs from 'fs';
import path from 'path';


export type CompilationResult = {
    result : boolean,
    path? : string,
}


export class Compiler
{
    
    protected _logger : Logger = new Logger('Compiler');
    
    
    public constructor (
        protected _runtimeContext : RuntimeContext
    )
    {}
    
    public async compile (
        contractName : string,
        releaseMode : boolean
    ) : Promise<CompilationResult>
    {
        const contractPath = path.join(
            this._runtimeContext.paths.contracts,
            contractName
        );
        const artifactsDirPath = path.join(
            this._runtimeContext.paths.artifacts,
            contractName
        );
        
        const args = [ 'contract', 'build' ];
        if (releaseMode) {
            args.push('--release');
        }
        
        const child = childProcess.spawn(
            'cargo',
            args,
            {
                cwd: contractPath,
            }
        );
        
        const displayLogs = this._runtimeContext.verbosity == VerbosityLevel.Verbose;
        const displayWarns = this._runtimeContext.verbosity >= VerbosityLevel.Default;
        
        // analyzing contracts output
        let outputDirectory : string;
        let compilationTextOutput = '';
        
        const analyzeOutput = (text : string) => {
            const lines = text.split('\n').map(line => line.trim());
            const lineIdx = lines
                .findIndex(line => line.includes('Your contract artifacts are ready'));
            if (lineIdx !== -1) {
                outputDirectory = lines[lineIdx + 1];
            }
            
            compilationTextOutput += text;
            
            if (displayLogs) {
                process.stdout.write(text);
            }
        };
        
        const [ stdin, stdout, stderr ] = child.stdio;
        stdout.setEncoding('utf-8');
        stderr.setEncoding('utf-8');
        
        stdout.on('data', analyzeOutput);
        stderr.on('data', analyzeOutput);
        
        const resultCode = await new Promise(resolve => {
            child.on('exit', code => resolve(code));
        });
        
        if (resultCode !== 0) {
            if (displayWarns) {
                this._logger.log(compilationTextOutput);
                this._logger.error('Failed building contract');
            }
            return { result: false };
        }
        
        if (!outputDirectory) {
            if (displayWarns) {
                this._logger.log(compilationTextOutput);
                this._logger.error('Unable to detect output directory');
            }
            return { result: false };
        }
        
        // create artifacts directory
        if (!fs.existsSync(artifactsDirPath)) {
            fs.mkdirSync(artifactsDirPath, { recursive: true });
        }
        
        // check & copy artifact files
        if (displayLogs) {
            this._logger.log(chalk.green('Files generated under:'));
        }
        
        const artifactFiles : string[] = [
            `${contractName}.contract`,
            `${contractName}.wasm`,
            `${contractName}.json`,
        ];
        for (const artifactFile of artifactFiles) {
            const sourceArtifactFilePath = path.join(outputDirectory, artifactFile);
            if (!fs.existsSync(sourceArtifactFilePath)) {
                if (displayWarns) {
                    this._logger.error(`File ${artifactFile} not generated under ${sourceArtifactFilePath}`);
                }
                
                return { result: false };
            }
            
            const artifactFilePath = path.join(artifactsDirPath, artifactFile);
            fs.copyFileSync(
                sourceArtifactFilePath,
                artifactFilePath
            );
            
            if (displayLogs) {
                this._logger.log(
                    path.relative(this._runtimeContext.paths.project, artifactFilePath)
                );
            }
        }
        
        if (displayLogs) {
            this._logger.log('');
        }
        
        return {
            result: true,
            path: artifactsDirPath
        };
    }
    
}
