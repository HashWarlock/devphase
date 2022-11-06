import type { Accounts, ContractType, DevPhaseOptions } from '@/def';
import { ContractFactory } from '@/service/api/ContractFactory';
import { EventQueue } from '@/service/api/EventQueue';
import { TxHandler } from '@/service/api/TxHandler';
import { RuntimeContext } from '@/service/project/RuntimeContext';
import type { ContractMetadata } from '@/typings';
import { Exception } from '@/utils/Exception';
import { Logger } from '@/utils/Logger';
import { replaceRecursive } from '@/utils/replaceRecursive';
import { waitFor, WaitForOptions } from '@/utils/waitFor';
import { types as PhalaSDKTypes } from '@phala/sdk';
import { khalaDev as KhalaTypes } from '@phala/typedefs';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { ApiOptions } from '@polkadot/api/types';
import * as Keyring from '@polkadot/keyring';
import type { KeyringPair } from '@polkadot/keyring/types';
import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';


type WorkerInfo = {
    publicKey : string,
    ecdhPublicKey : string,
}

export type GetFactoryOptions = {
    clusterId? : string
}


export class DevPhase
{
    
    public readonly api : ApiPromise;
    public readonly options : DevPhaseOptions;
    public readonly workerUrl : string;
    public readonly workerApi : AxiosInstance;
    
    public readonly accounts : Accounts = {};
    public readonly sudoAccount : KeyringPair;
    
    public readonly mainClusterId : string;
    
    public readonly runtimeContext : RuntimeContext;
    
    protected _logger : Logger = new Logger('devPhase');
    protected _apiProvider : WsProvider;
    protected _apiOptions : ApiOptions;
    protected _eventQueue : EventQueue = new EventQueue();
    protected _workerInfo : WorkerInfo;
    
    protected _artifactsPath : string;
    
    
    private constructor () {}
    
    public static async setup (
        options : DevPhaseOptions = {},
        runtimeContext? : RuntimeContext
    ) : Promise<DevPhase>
    {
        options = replaceRecursive({
            nodeUrl: 'ws://localhost:9944',
            nodeApiOptions: {
                types: {
                    ...KhalaTypes,
                    ...PhalaSDKTypes,
                }
            },
            workerUrl: 'http://localhost:8000',
            accountsMnemonic: '',
            accountsPaths: {
                alice: '//Alice',
                bob: '//Bob',
                charlie: '//Charlie',
                dave: '//Dave',
                eve: '//Eve',
                ferdie: '//Ferdie',
            },
            sudoAccount: 'alice',
            ss58Prefix: 30,
            clusterId: undefined,
        }, options);
        
        const instance = new DevPhase();
        
        instance._apiOptions = options.nodeApiOptions;
        instance._apiProvider = new WsProvider(options.nodeUrl);
        
        const api = await instance.createApiPromise();
        await instance._eventQueue.init(api);
        
        // get accounts
        const keyring = new Keyring.Keyring();
        keyring.setSS58Format(options.ss58Prefix);
        
        for (const [ name, path ] of Object.entries(options.accountsPaths)) {
            instance.accounts[name] = keyring.createFromUri(
                options.accountsMnemonic + path,
                undefined,
                'sr25519'
            );
        }
        
        Object.assign(instance, {
            options,
            runtimeContext,
            api,
            sudoAccount: instance.accounts[options.sudoAccount],
        });
        
        if (runtimeContext) {
            instance._artifactsPath = path.resolve(
                runtimeContext.projectDir,
                runtimeContext.config.directories.artifacts
            );
        }
        
        return instance;
    }
    
    public async createApiPromise () : Promise<ApiPromise>
    {
        return ApiPromise.create({
            provider: this._apiProvider,
            ...this._apiOptions
        });
    }
    
    /**
     * Default environment setup
     */
    public async defaultEnvSetup ()
    {
        // check worker
        await this.prepareWorker(this.options.workerUrl);
        
        // wait for gatekeeper
        await this.prepareGatekeeper();
        
        // create cluster if needed
        if (this.options.clusterId === undefined) {
            const clustersNum : number = <any>(
                await this.api.query
                    .phalaFatContracts.clusterCounter()
            ).toJSON();
            
            if (clustersNum == 0) {
                this.options.clusterId = null;
            }
            else {
                this.options.clusterId = '0x0000000000000000000000000000000000000000000000000000000000000000';
            }
        }
        
        const mainClusterId = this.options.clusterId === null
            ? await this.createCluster()
            : this.options.clusterId
        ;
        
        Object.assign(this, { mainClusterId });
        
        // wait for cluster
        await this.waitForClusterReady();
    }
    
    /**
     * Prepare DEV worker
     */
    public async prepareWorker (workerUrl : string)
    {
        Object.assign(this, {
            workerUrl,
            workerApi: axios.create({ baseURL: workerUrl })
        });
        
        this._workerInfo = await this._waitFor(
            async() => {
                const { status, data } = await this.workerApi.get('/get_info', { validateStatus: () => true });
                if (status === 200) {
                    const payload : any = JSON.parse(data.payload);
                    if (!payload.initialized) {
                        return false;
                    }
                    
                    return {
                        publicKey: '0x' + payload.public_key,
                        ecdhPublicKey: '0x' + payload.ecdh_public_key,
                    };
                }
                
                throw new Exception(
                    'Unable to get worker info',
                    1663941402827
                );
            },
            20 * 1000,
            { message: 'pRuntime initialization' }
        );
        
        const workerInfo : typeof KhalaTypes.WorkerInfo = <any>(
            await this.api.query
                .phalaRegistry.workers(this._workerInfo.ecdhPublicKey)
        ).toJSON();
        
        if (!workerInfo) {
            // register worker
            const tx = this.api.tx.sudo.sudo(
                this.api.tx.phalaRegistry.forceRegisterWorker(
                    this._workerInfo.publicKey,
                    this._workerInfo.ecdhPublicKey,
                    null
                )
            );
            
            const result = await TxHandler.handle(
                tx,
                this.sudoAccount,
                'sudo(phalaRegistry.forceRegisterWorker)'
            );
            
            await this._waitFor(
                async() => {
                    return (
                        await this.api.query
                            .phalaRegistry.workers(this._workerInfo.ecdhPublicKey)
                    ).toJSON();
                },
                20 * 1000,
                { message: 'Worker registration' }
            );
        }
    }
    
    public async prepareGatekeeper ()
    {
        // check gatekeeper
        const gatekeepers : string[] = <any>(
            await this.api.query
                .phalaRegistry.gatekeeper()
        ).toJSON();
        
        if (!gatekeepers.includes(this._workerInfo.publicKey)) {
            // register gatekeeper
            const tx = this.api.tx.sudo.sudo(
                this.api.tx.phalaRegistry.registerGatekeeper(
                    this._workerInfo.publicKey
                )
            );
            
            const result = await TxHandler.handle(
                tx,
                this.sudoAccount,
                'sudo(phalaRegistry.registerGatekeeper)'
            );
        }
        
        // wait for gate keeper master key
        try {
            await this._waitFor(
                async() => {
                    return !(
                        await this.api.query
                            .phalaRegistry.gatekeeperMasterPubkey()
                    ).isEmpty;
                },
                20 * 1000,
                { message: 'GK master key generation' }
            );
        }
        catch (e) {
            throw new Exception(
                'Could not fetch GK master key',
                1663941402827
            );
        }
    }
    
    /**
     * Creates new cluster
     */
    public async createCluster () : Promise<string>
    {
        this._logger.log('Creating cluster');
        
        // create cluster
        const tx = this.api.tx.sudo.sudo(
            this.api.tx.phalaFatContracts.addCluster(
                this.accounts.alice.address,
                { Public: null },
                [ this._workerInfo.publicKey ]
            )
        );
        
        const result = await TxHandler.handle(
            tx,
            this.sudoAccount,
            'sudo(phalaFatContracts.addCluster)'
        );
        
        const clusterCreatedEvent = result.events.find(({ event }) => {
            return event.section === 'phalaFatContracts'
                && event.method === 'ClusterCreated';
        });
        if (!clusterCreatedEvent) {
            throw new Exception(
                'Error while creating cluster',
                1663941940784
            );
        }
        
        const clusterId = clusterCreatedEvent.event.data[0].toString();
        
        this._logger.log(chalk.green('Cluster created'));
        this._logger.log(clusterId);
        
        return clusterId;
    }
    
    /**
     * Wait for cluster to be ready
     */
    public async waitForClusterReady () : Promise<boolean>
    {
        return this._waitFor(
            async() => {
                // cluster exists
                const cluster = await this.api.query
                    .phalaFatContracts.clusters(this.mainClusterId);
                if (cluster.isEmpty) {
                    return false;
                }
                
                // cluster key set
                const clusterKey = await this.api.query
                    .phalaRegistry.clusterKeys(this.mainClusterId);
                if (clusterKey.isEmpty) {
                    return false;
                }
                
                return true;
            },
            20 * 1000,
            { message: 'Cluster ready' }
        );
    }
    
    /**
     * Cleanup task
     */
    public async cleanup ()
    {
        await this._eventQueue.destroy();
        await this.api.disconnect();
    }
    
    
    public async getFactory<T extends ContractFactory> (
        type : ContractType,
        artifactPathOrName : string,
        options : GetFactoryOptions = {}
    ) : Promise<T>
    {
        options = {
            clusterId: this.mainClusterId,
            ...options
        };
        
        // get artifact path
        const isContractName = /^[a-z0-9_]+$/i.test(artifactPathOrName);
        
        let artifactPath = artifactPathOrName;
        if (isContractName) {
            if (!this.runtimeContext) {
                throw new Exception(
                    'It is not allowed to use contract name in this context',
                    1667493436149
                );
            }
            
            artifactPath = path.join(
                this._artifactsPath,
                artifactPathOrName,
                `${artifactPathOrName}.contract`
            );
        }
        
        if (!fs.existsSync(artifactPath)) {
            throw new Exception(
                'Contract artifact file not found',
                1665238985042
            );
        }
        
        const contractRaw : string = fs.readFileSync(
            artifactPath,
            { encoding: 'utf-8' }
        );
        
        try {
            const metadata : ContractMetadata.Metadata = JSON.parse(contractRaw);
            
            return ContractFactory.create(
                this,
                type,
                metadata,
                options.clusterId
            );
        }
        catch (e) {
            throw new Exception(
                'Failed to parse contract artifiact JSON',
                1665238941553,
                e
            );
        }
    }
    
    
    protected async _waitFor (
        callback : () => Promise<any>,
        timeLimit : number,
        options : WaitForOptions = {}
    )
    {
        const firstTry = await callback();
        if (firstTry) {
            return firstTry;
        }
        
        if (options.message) {
            this._logger.debug('Waiting for', chalk.cyan(options.message));
        }
        
        const result = waitFor(
            callback,
            timeLimit,
            options
        );
        
        this._logger.debug(chalk.green('Ready'));
        
        return result;
    }
    
}
