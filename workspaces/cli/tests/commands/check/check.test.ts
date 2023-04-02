import { expect, test } from '@oclif/test';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';


describe('Command ' + chalk.cyan('init'), () => {
    const ROOT_PATH = process.cwd();
    const CONTEXT_PATH = path.resolve('./tests/context');
    const PRESERVE_FILES = [
        '.gitignore',
        '.devphase',
        'stacks',
        'tests'
    ];
    
    beforeEach(() => {
        // restore working dir
        process.chdir(ROOT_PATH);
    
        // clean up context
        const files = fs.readdirSync(CONTEXT_PATH);
        const filesToDelete = files.filter(file => !PRESERVE_FILES.includes(file));
        
        filesToDelete.forEach(file => {
            const filePath = path.join(
                CONTEXT_PATH,
                file
            );
            fs.rmSync(filePath, { recursive: true });
        });
        
        // change working dir to context
        process.chdir(CONTEXT_PATH);
    });
    
    const pTest = test
        .stdout()//{ print: true })
        .timeout(10_000)
        .command([ 'init', '-v' ])
        ;
        
    pTest.it('Should properly execute init', ctx => {
        expect(ctx.stdout).to.include('Creating directories');
        expect(ctx.stdout).to.include('Creating files');
        expect(ctx.stdout).to.include('Creating sample contract');
    });
    
    pTest.it('Should create config file', ctx => {
        const configFilePath = path.join(
            CONTEXT_PATH,
            'devphase.config.ts'
        );
        expect(fs.existsSync(configFilePath)).to.be.equal(true);
    });
    
    pTest.it('Should create sample contract', ctx => {
        const libPath = path.join(
            CONTEXT_PATH,
            'contracts/flipper/lib.rs'
        );
        expect(fs.existsSync(libPath)).to.be.equal(true);
        
        const cargoPath = path.join(
            CONTEXT_PATH,
            'contracts/flipper/Cargo.toml'
        );
        expect(fs.existsSync(cargoPath)).to.be.equal(true);
    });
});
