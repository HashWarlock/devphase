import { Signing } from '@/typings/Signing';
import { ContractType } from '@devphase/service';
import * as PhalaSdk from '@phala/sdk';
import type { KeyringPair } from '@polkadot/keyring/types';


describe('Signing', () => {
    let factory : Signing.Factory;
    let contract : Signing.Contract;
    let signer : KeyringPair;
    let cert : PhalaSdk.CertificateData;
    
    before(async function() {
        factory = await this.devPhase.getFactory(
            'signing',
            { contractType: ContractType.InkCode }
        );
        
        await factory.deploy();
        
        signer = this.devPhase.accounts.bob;
        cert = await PhalaSdk.signCertificate({ pair: signer });
    });
    
    describe('default constructor', () => {
        before(async function() {
            contract = await factory.instantiate('default', []);
        });
        const message = 'hi, how are ya?';
        
        it('Should be able derive keypair & sign/verify messages', async function() {
            const response = await contract.query.test(signer.address, { cert }, message);
            console.log(response.output.toJSON());
        });
    });
    
});
